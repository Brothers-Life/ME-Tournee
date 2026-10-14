// État de la journée + file d'attente hors-ligne.
// Chaque action du chauffeur est appliquée tout de suite à l'écran, enregistrée sur le
// téléphone, puis envoyée au serveur dès que le réseau le permet, dans l'ordre.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { api, ApiError, OfflineError, uploadPhoto } from './api';
import type { Today } from './types';

type Op =
  | { id: string; kind: 'upload'; tempId: string; uri: string; at: string }
  | { id: string; kind: 'call'; method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; label: string; at: string };

interface State {
  today: Today | null;
  outbox: Op[];
  uploads: Record<string, string>;
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  rejected: { label: string; error: string; at: string }[];
}

const KEY = 'me.state';
const initial: State = { today: null, outbox: [], uploads: {}, online: true, syncing: false, lastSync: null, rejected: [] };

let state: State = initial;
const listeners = new Set<() => void>();

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
  const { today, outbox, uploads, lastSync, rejected } = state;
  AsyncStorage.setItem(KEY, JSON.stringify({ today, outbox, uploads, lastSync, rejected })).catch(() => {});
}

export function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function hydrate() {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) state = { ...initial, ...JSON.parse(raw), syncing: false };
  listeners.forEach((l) => l());
}

export async function resetStore() {
  state = initial;
  await AsyncStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

export function useStore<T>(select: (s: State) => T): T {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => select(state),
    () => select(state),
  );
}

export const getState = () => state;

/** Remplace les identifiants provisoires des photos par ceux du serveur. */
function resolveTemp<T>(value: T, uploads: Record<string, string>): T {
  const json = JSON.stringify(value ?? null).replace(/tmp-[0-9a-f-]{36}/g, (m) => uploads[m] ?? m);
  return JSON.parse(json) as T;
}

let flushing: Promise<void> | null = null;

export function flush(): Promise<void> {
  if (!flushing) {
    flushing = (async () => {
      // Laisse `flushing` être assigné avant de pouvoir le remettre à null dans le finally.
      await Promise.resolve();
      set({ syncing: true });
      try {
        while (state.outbox.length) {
          const op = state.outbox[0]!;
          try {
            if (op.kind === 'upload') {
              const serverId = await uploadPhoto(op.uri);
              set((s) => ({ uploads: { ...s.uploads, [op.tempId]: serverId } }));
            } else {
              await api(op.method, op.path, resolveTemp(op.body, state.uploads));
            }
            set((s) => ({ outbox: s.outbox.slice(1), online: true }));
          } catch (err) {
            if (err instanceof OfflineError) {
              set({ online: false });
              return;
            }
            // Refus du serveur : on écarte l'action pour ne pas bloquer la file, et on le signale.
            const label = op.kind === 'upload' ? 'Envoi de photo' : op.label;
            set((s) => ({
              outbox: s.outbox.slice(1),
              rejected: [...s.rejected.slice(-9), { label, error: (err as Error).message, at: new Date().toISOString() }],
            }));
          }
        }
        set({ lastSync: new Date().toISOString() });
      } finally {
        set({ syncing: false });
        flushing = null;
      }
    })();
  }
  return flushing;
}

/** Recharge la journée depuis le serveur (après avoir vidé la file d'attente). */
export async function refresh(): Promise<void> {
  await flush();
  if (state.outbox.length) return; // encore hors-ligne : on garde la version locale
  try {
    const today = await api<Today>('GET', '/driver/today');
    set({ today, online: true });
  } catch (err) {
    if (err instanceof OfflineError) set({ online: false });
    else throw err;
  }
}

/** Ajoute une photo à envoyer ; renvoie son identifiant provisoire. */
export function queuePhoto(uri: string): string {
  const tempId = `tmp-${uid()}`;
  set((s) => ({ outbox: [...s.outbox, { id: uid(), kind: 'upload', tempId, uri, at: new Date().toISOString() }] }));
  return tempId;
}

/** Enregistre une action : appliquée tout de suite en local, envoyée dès que possible. */
export function act(
  label: string,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  mutate?: (t: Today) => void,
) {
  set((s) => {
    let today = s.today;
    if (today && mutate) {
      today = structuredClone(today);
      mutate(today);
    }
    return { today, outbox: [...s.outbox, { id: uid(), kind: 'call', method, path, body, label, at: new Date().toISOString() }] };
  });
  void flush();
}

export function clearRejected() {
  set({ rejected: [] });
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Modifie l'état local sans rien envoyer (ex. pointage des lignes avant validation). */
export function patchLocal(mutate: (t: Today) => void) {
  set((s) => {
    if (!s.today) return {};
    const today = structuredClone(s.today);
    mutate(today);
    return { today };
  });
}
