/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de l'API ME Tournée (défaut : http://localhost:3000). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
