/**
 * Cloudflare Turnstile — lazy script loader + explicit-render helpers for the publish gate.
 *
 * The widget script is loaded once, on first use (nothing is fetched until a user actually
 * opens "Share / publish…" and moves to make a workflow public), then cached. Rendering is
 * explicit (`render=explicit`) so the caller controls placement and lifecycle: `renderTurnstile`
 * returns a widget id that `removeTurnstile` tears down when the dialog closes.
 *
 * `turnstileSiteKey()` reads the build-time `VITE_TURNSTILE_SITE_KEY`; with none set (local dev)
 * it falls back to Cloudflare's documented always-passes *test* site key, so the flow is
 * exercisable without a real Turnstile site. The server still verifies the token against the
 * matching secret — this key only governs which widget the browser renders.
 */

/** Cloudflare's documented "always passes, visible" test site key (dev fallback). */
const TEST_SITE_KEY = '1x00000000000000000000AA'
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** The subset of the global `turnstile` object we use (explicit-render API). */
interface TurnstileApi {
  render(el: HTMLElement, opts: TurnstileRenderOptions): string
  remove(id: string): void
  reset(id: string): void
}

interface TurnstileRenderOptions {
  sitekey: string
  callback?: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** The public site key to render with: the build-time value, or the dev test key. */
export function turnstileSiteKey(): string {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY || TEST_SITE_KEY
}

/** Memoized load of the Turnstile script; resolves with the global API once ready. */
let loader: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loader) return loader

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const ready = () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('Verification widget failed to initialize.'))
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    )
    if (existing) {
      existing.addEventListener('load', ready)
      existing.addEventListener('error', () =>
        reject(new Error('Could not load the verification widget.')),
      )
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = ready
    script.onerror = () => {
      loader = null // allow a later retry
      reject(new Error('Could not load the verification widget.'))
    }
    document.head.appendChild(script)
  })
  return loader
}

/** Handlers the widget invokes; `onToken` fires with a one-time token on a passing challenge. */
export interface TurnstileHandlers {
  onToken: (token: string) => void
  onError?: () => void
  onExpire?: () => void
}

/**
 * Render a Turnstile widget into `container`, resolving with its widget id. Loads the script on
 * first call. Callers keep the id to tear the widget down via `removeTurnstile` on close.
 */
export async function renderTurnstile(
  container: HTMLElement,
  handlers: TurnstileHandlers,
): Promise<string> {
  const api = await loadTurnstile()
  return api.render(container, {
    sitekey: turnstileSiteKey(),
    callback: handlers.onToken,
    'error-callback': handlers.onError,
    'expired-callback': handlers.onExpire,
  })
}

/** Remove a previously rendered widget (no-op if the script never loaded). */
export function removeTurnstile(id: string): void {
  window.turnstile?.remove(id)
}
