/**
 * Same-origin redirect validation — the open-redirect guard for the OAuth `returnTo`.
 *
 * A value is only honored if it is a path on our own origin: it must start with a single `/`
 * that is NOT followed by another `/`. That rejects absolute URLs (`https://evil.com`) and
 * protocol-relative ones (`//evil.com`, which a browser treats as an absolute URL). Anything
 * else — including a missing value — falls back to the site root `/`.
 */

/** Path-only, not protocol-relative: `/foo` ok; `//evil`, `https://…`, `` not. */
const SAME_ORIGIN_PATH = /^\/(?!\/)/

/** Coerce an untrusted `returnTo` into a safe same-origin path, defaulting to `/`. */
export function safeReturnTo(value: string | null | undefined): string {
  return value && SAME_ORIGIN_PATH.test(value) ? value : '/'
}
