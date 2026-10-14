// Suivi GPS : actif uniquement pendant une tournée en cours, jamais en dehors.
import * as Location from 'expo-location';
import { api } from './api';

let sub: Location.LocationSubscription | null = null;
let currentTour: string | null = null;
let buffer: { lat: number; lng: number; accuracy: number | null; at: string }[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

async function send() {
  if (!buffer.length || !currentTour) return;
  const points = buffer.slice(0, 500);
  try {
    await api('POST', '/driver/positions', { tourId: currentTour, points });
    buffer = buffer.slice(points.length);
  } catch {
    // Hors-ligne : on garde les points (au plus 2000) pour le prochain envoi.
    buffer = buffer.slice(-2000);
  }
}

export async function startTracking(tourId: string) {
  if (currentTour === tourId && sub) return;
  await stopTracking();
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    currentTour = tourId;
    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 50 },
      (p) => buffer.push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, at: new Date(p.timestamp).toISOString() }),
    );
    timer = setInterval(send, 60_000);
  } catch {
    // GPS indisponible (navigateur sans autorisation…) : l'app reste utilisable.
  }
}

export async function stopTracking() {
  await send();
  sub?.remove();
  sub = null;
  if (timer) clearInterval(timer);
  timer = null;
  currentTour = null;
}
