/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Cloudflare Turnstile *site* key (public, safe to ship in the bundle) for the publish gate.
   * Baked at build time; when unset, `turnstileSiteKey()` falls back to Cloudflare's test key.
   */
  readonly VITE_TURNSTILE_SITE_KEY?: string
  /**
   * Cloudflare Web Analytics *beacon token* (public) for raw traffic (pageviews/visitors).
   * When set, `initWebAnalytics()` injects the cookieless beacon script; when unset, only the
   * first-party `/api/events` pipeline runs. Baked at build time.
   */
  readonly VITE_CF_BEACON_TOKEN?: string
}
