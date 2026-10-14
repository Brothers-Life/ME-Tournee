import AsyncStorage from '@react-native-async-storage/async-storage';

// URL de l'API : fournie au démarrage par le serveur web (/env.js), sinon à la compilation.
const runtimeEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__ ?? {};
export const API_URL = (runtimeEnv.PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const TOKEN_KEY = 'me.token';
let token: string | null = null;

export async function loadToken() {
  token = await AsyncStorage.getItem(TOKEN_KEY);
  return token;
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Erreur réseau (pas de connexion) : l'action part dans la file d'attente hors-ligne. */
export class OfflineError extends Error {}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new OfflineError('Pas de connexion');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Erreur ${res.status}`, (data as { code?: string }).code);
  return data as T;
}

/** Envoie une photo (URI locale ou data URI) et renvoie l'id du fichier côté serveur. */
export async function uploadPhoto(uri: string, name = 'photo.jpg'): Promise<string> {
  const form = new FormData();
  if (uri.startsWith('data:') || uri.startsWith('blob:')) {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, name);
  } else {
    // Natif : React Native accepte un objet { uri, name, type }.
    form.append('file', { uri, name, type: 'image/jpeg' } as unknown as Blob);
  }
  let res: Response;
  try {
    res = await fetch(API_URL + '/files', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  } catch {
    throw new OfflineError('Pas de connexion');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Envoi de la photo impossible');
  return (data as { id: string }).id;
}
