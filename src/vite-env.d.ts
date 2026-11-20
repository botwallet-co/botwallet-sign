/// <reference types="vite/client" />

/** The VITE_* variables this page reads */
interface ImportMetaEnv {
  /** The Botwallet API (src/lib/api.ts); production's when unset */
  readonly VITE_API_URL?: string;
}
