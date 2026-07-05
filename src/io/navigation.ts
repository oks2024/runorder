/**
 * Full-page navigation indirection.
 *
 * A one-line wrapper over `location.assign` so the OAuth sign-in redirect (a real browser
 * navigation, not a fetch) has a single seam that RTL/Vitest can spy on — jsdom throws
 * "Not implemented: navigation" if a component calls `location.assign` directly. Keep this
 * dependency-free and side-effect-free at import time.
 */

/** Navigate the whole page to `url` (used for the OAuth login redirect). */
export function navigate(url: string): void {
  location.assign(url)
}
