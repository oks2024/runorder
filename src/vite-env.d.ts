/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Cloudflare Turnstile *site* key (public, safe to ship in the bundle) for the publish gate.
   * Baked at build time; when unset, `turnstileSiteKey()` falls back to Cloudflare's test key.
   */
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
