// Client HTTP de l'API ME Tournée : jeton de session, erreurs normalisées,
// et intercepteur PIN (les actions sensibles renvoient 403 pin_required / pin_invalid).

// URL de l'API : fournie au démarrage par le serveur web (/env.js), sinon à la compilation.
const runtimeEnv = (window as { __ENV__?: Record<string, string> }).__ENV__ ?? {};
export const API_URL = (runtimeEnv.PUBLIC_API_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const TOKEN_KEY = "me.token";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
}

let token: string | null = safeGet(TOKEN_KEY);
const tokenListeners = new Set<(t: string | null) => void>();

export function getToken() {
  return token;
}

export function setToken(t: string | null) {
  token = t;
  if (!t) recentPin = null;
  safeSet(TOKEN_KEY, t);
  for (const l of tokenListeners) l(t);
}

export function onTokenChange(listener: (t: string | null) => void) {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Erreur levée quand l'utilisateur annule la saisie du PIN (pas de toast). */
export class PinCancelledError extends Error {
  constructor() {
    super("Action annulée");
  }
}

/** Fonction fournie par le PinDialogProvider : demande le PIN, renvoie null si annulé. */
type PinRequester = (message: string, invalid: boolean) => Promise<string | null>;
let pinRequester: PinRequester | null = null;

const PIN_MEMORY_MS = 60_000;
let recentPin: { pin: string; until: number } | null = null;

export function forgetPin() {
  recentPin = null;
}

export function registerPinRequester(fn: PinRequester | null) {
  pinRequester = fn;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  pin?: string;
  /** Format de réponse attendu. */
  as?: "json" | "blob";
  signal?: AbortSignal;
  /** Ne pas ouvrir la boîte de dialogue PIN sur 403 (ex. déverrouillage). */
  skipPinPrompt?: boolean;
}

export function buildUrl(path: string, query?: Query) {
  const url = new URL(API_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function rawRequest(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.pin) headers["X-Pin"] = opts.pin;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  try {
    return await fetch(buildUrl(path, opts.query), { method: opts.method ?? "GET", headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Impossible de joindre le serveur, vérifiez la connexion");
  }
}

async function readError(res: Response): Promise<ApiError> {
  let message = `Erreur ${res.status}`;
  let code: string | undefined;
  try {
    const data = (await res.json()) as { error?: string; code?: string };
    if (data.error) message = data.error;
    code = data.code;
  } catch {
    /* corps non JSON */
  }
  return new ApiError(res.status, message, code);
}

export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(path, opts);
  let pinInvalid = false;
  // Intercepteur PIN : on redemande tant que l'utilisateur n'annule pas.
  while (res.status === 403) {
    const err = await readError(res);
    if ((err.code !== "pin_required" && err.code !== "pin_invalid") || !pinRequester || opts.skipPinPrompt) throw err;
    pinInvalid = err.code === "pin_invalid" && !!opts.pin;
    if (pinInvalid) recentPin = null;
    // PIN saisi il y a moins d'une minute : on le rejoue sans redemander (enchaînement d'actions).
    if (!pinInvalid && recentPin && recentPin.until > Date.now() && opts.pin !== recentPin.pin) {
      opts = { ...opts, pin: recentPin.pin };
      res = await rawRequest(path, opts);
      continue;
    }
    const pin = await pinRequester(pinInvalid ? "Code PIN incorrect, réessayez." : "Confirmez cette action avec votre code PIN personnel.", pinInvalid);
    if (!pin) throw new PinCancelledError();
    opts = { ...opts, pin };
    res = await rawRequest(path, opts);
  }
  if (res.status === 401 && token && !path.startsWith("/auth/login")) {
    const err = await readError(res);
    setToken(null);
    throw err;
  }
  if (!res.ok) throw await readError(res);
  if (opts.pin) recentPin = { pin: opts.pin, until: Date.now() + PIN_MEMORY_MS };
  if (opts.as === "blob") return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, opts?: Omit<RequestOptions, "method" | "query">) => request<T>(path, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => request<T>(path, { ...opts, method: "POST", body: body ?? {} }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, "method">) => request<T>(path, { ...opts, method: "DELETE" }),
  blob: (path: string, query?: Query) => request<Blob>(path, { query, as: "blob" }),
};

export interface UploadedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export function uploadFile(file: File, kind?: string) {
  const form = new FormData();
  if (kind) form.append("kind", kind);
  form.append("file", file);
  return request<UploadedFile>("/files", { method: "POST", body: form });
}

/** Déclenche le téléchargement d'un blob dans le navigateur. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(e: unknown): string | null {
  if (e instanceof PinCancelledError) return null;
  if (e instanceof Error) return e.message;
  return "Erreur inattendue";
}
