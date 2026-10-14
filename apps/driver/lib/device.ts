// Accès au téléphone : photos, position, appels et SMS.
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

/** Prend une photo (ou en choisit une sur le web) et la compresse pour l'envoi. */
export async function takePhoto(): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (res.canceled || !res.assets[0]) return null;
  const small = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 1280 } }], {
    compress: 0.6,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: Platform.OS === 'web',
  });
  // Sur le web on garde une data URI : elle survit au rechargement de la page (mode hors-ligne).
  return Platform.OS === 'web' && small.base64 ? `data:image/jpeg;base64,${small.base64}` : small.uri;
}

/** Position actuelle, ou null si refusée ou trop longue à obtenir : on ne bloque jamais le chauffeur. */
export async function currentPosition(timeoutMs = 5000): Promise<{ lat: number; lng: number } | null> {
  const attempt = (async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return null;
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: p.coords.latitude, lng: p.coords.longitude };
    } catch {
      return null;
    }
  })();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([attempt, timeout]);
}

export function call(phone: string) {
  return Linking.openURL(`tel:${phone}`);
}

export function sms(phone: string, body: string) {
  const sep = Platform.OS === 'ios' ? '&' : '?';
  return Linking.openURL(`sms:${phone}${sep}body=${encodeURIComponent(body)}`);
}

export function openMaps(address: string) {
  return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
}
