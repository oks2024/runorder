/**
 * Client-side analytics — the small, deliberately-inert-by-default sender for first-party
 * product events, plus optional Cloudflare Web Analytics for raw traffic.
 *
 * Two hard rules, both about *not* being load-bearing:
 *   1. Analytics must never break the app. Every path is wrapped so a missing API, an offline
 *      network, or a hostile environment degrades to a silent no-op — `track` returns `void`
 *      and never throws or rejects into a caller.
 *   2. Analytics must never override the user. `Do Not Track` (`navigator.doNotTrack === '1'`)
 *      suppresses everything, including the pageview.
 *
 * Events are fire-and-forget beacons to `POST /api/events` (see `functions/api/events.ts`),
 * which carries no client identifier — uniqueness is reconstructed server-side, cookielessly.
 * `sendBeacon` is preferred (survives page unload); `fetch(..., { keepalive })` is the
 * fallback. There is no queue and no retry: a dropped event is an acceptable loss.
 *
 * Scope note: this pipeline records *product actions* only (pattern insert, export, publish, …).
 * Raw traffic — pageviews and unique visitors — is owned by Cloudflare Web Analytics (see
 * `initWebAnalytics`), whose beacon costs nothing against the Pages Functions / D1 free-plan
 * budgets. There is deliberately no first-party `pageview` event.
 */

/** Metadata values we allow on an event; the server clamps counts/lengths regardless. */
export type EventProps = Record<string, string | number | boolean>

/** Whether the user has asked not to be tracked (respected for all events). */
function doNotTrack(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator.doNotTrack === '1' ||
      (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl ===
        true)
  )
}

/**
 * Record a product event. Fire-and-forget: returns immediately, never throws. `name` should be
 * lowercase snake_case (the server validates the shape); `props` is small, non-PII metadata.
 */
export function track(name: string, props?: EventProps): void {
  try {
    if (typeof window === 'undefined' || doNotTrack()) return
    const body = JSON.stringify({ name, path: window.location.pathname, props })

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon('/api/events', blob)) return
    }
    if (typeof fetch === 'function') {
      void fetch('/api/events', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Analytics is best-effort and must never surface to the user.
  }
}

/**
 * Inject the Cloudflare Web Analytics beacon (cookieless traffic stats) when a token is baked
 * in via `VITE_CF_BEACON_TOKEN`. No-ops when unset or already injected, and respects DNT.
 * This is the raw-traffic complement to the first-party product events above.
 */
export function initWebAnalytics(): void {
  try {
    if (typeof document === 'undefined' || doNotTrack()) return
    const token = import.meta.env.VITE_CF_BEACON_TOKEN
    if (!token) return
    if (document.querySelector('script[data-cf-beacon]')) return
    const script = document.createElement('script')
    script.defer = true
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
    script.setAttribute('data-cf-beacon', JSON.stringify({ token }))
    document.head.appendChild(script)
  } catch {
    // Best-effort; a missing beacon never affects the app.
  }
}
