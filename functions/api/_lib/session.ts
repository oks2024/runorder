/**
 * Stateless signed-cookie sessions — no server-side session store.
 *
 * A session is a self-describing string `${userId}.${expiry}.${sig}` where `sig` is a
 * base64url HMAC-SHA256 of `${userId}.${expiry}` keyed on `SESSION_SECRET`. The signature is
 * what makes it unforgeable: without the secret you cannot produce a `sig` that verifies, and
 * `expiry` (unix seconds) bounds the lifetime so a leaked cookie eventually dies on its own.
 *
 * Two design rules matter:
 *   1. Verification uses `crypto.subtle.verify` (constant-time) — never a string compare of
 *      digests, which leaks timing. `verifySession` recomputes nothing to compare by hand.
 *   2. The pure `signSession` / `verifySession` take time explicitly so tests are
 *      deterministic; only the request-facing `getSessionUserId` reads the wall clock.
 *
 * The token rides in an `HttpOnly; Secure; SameSite=Lax` cookie so it is invisible to page JS
 * and not sent on cross-site top-level POSTs.
 */
import type { Env } from './env'

/** Session lifetime: 30 days, in seconds. */
export const SESSION_TTL_SECONDS = 2592000

/** The cookie name carrying the signed session token. */
export const SESSION_COOKIE = 'ro_session'

const encoder = new TextEncoder()

/** Import the shared secret as a non-extractable HMAC-SHA256 key for sign + verify. */
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** Base64url (no padding) of raw bytes — the on-the-wire form of a signature. */
function base64urlEncode(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Inverse of `base64urlEncode`. Throws on malformed input (caller treats that as bad-sig). */
function base64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Produce a signed session token for `userId` valid until `expiresAtEpochSeconds`. */
export async function signSession(
  userId: number,
  expiresAtEpochSeconds: number,
  secret: string,
): Promise<string> {
  const payload = `${userId}.${expiresAtEpochSeconds}`
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return `${payload}.${base64urlEncode(sig)}`
}

/**
 * Verify a session token against `nowEpochSeconds`, returning the user id or `null`.
 *
 * Returns `null` for anything untrustworthy: wrong part count, non-numeric ids, a malformed
 * signature, a signature that does not verify, or an expired token. Never throws.
 */
export async function verifySession(
  value: string,
  nowEpochSeconds: number,
  secret: string,
): Promise<number | null> {
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [userIdRaw, expiryRaw, sigRaw] = parts

  // Both fields must be plain non-negative integers — reject `1e3`, `0x1`, `1.5`, ` 1`, etc.
  if (!/^\d+$/.test(userIdRaw) || !/^\d+$/.test(expiryRaw)) return null
  const userId = Number(userIdRaw)
  const expiry = Number(expiryRaw)
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(expiry)) return null

  if (expiry <= nowEpochSeconds) return null

  let sigBytes: Uint8Array
  try {
    sigBytes = base64urlDecode(sigRaw)
  } catch {
    return null
  }

  const key = await hmacKey(secret)
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    encoder.encode(`${userIdRaw}.${expiryRaw}`),
  )
  return ok ? userId : null
}

/**
 * Whether cookies set for this request should carry `Secure`.
 *
 * `Secure` cookies are only stored/sent over HTTPS, which is what we want in prod. But local
 * dev is plain `http://localhost` (or `127.0.0.1`), where a `Secure` cookie would be silently
 * dropped — breaking the OAuth CSRF round-trip and the session. Gate `Secure` on the request
 * actually being HTTPS so the same code works locally and in prod.
 */
export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:'
}

/** Build the `Set-Cookie` value that plants a session token for `maxAge` seconds. */
export function sessionCookie(value: string, maxAge: number, secure = true): string {
  const secureAttr = secure ? ' Secure;' : ''
  return `${SESSION_COOKIE}=${value}; HttpOnly;${secureAttr} SameSite=Lax; Path=/; Max-Age=${maxAge}`
}

/** Build the `Set-Cookie` value that immediately expires the session cookie. */
export function clearSessionCookie(secure = true): string {
  const secureAttr = secure ? ' Secure;' : ''
  return `${SESSION_COOKIE}=; HttpOnly;${secureAttr} SameSite=Lax; Path=/; Max-Age=0`
}

/** Parse a `Cookie` request header into a name→value map (empty for a missing header). */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name) out[name] = value
  }
  return out
}

/**
 * Resolve the signed-in user id from a request's session cookie, or `null`.
 *
 * This is the only session function that reads the clock (`Date.now()`), keeping the sign /
 * verify primitives above pure and time-injected for tests.
 */
export async function getSessionUserId(
  request: Request,
  env: Env,
): Promise<number | null> {
  const cookies = parseCookies(request.headers.get('Cookie'))
  const token = cookies[SESSION_COOKIE]
  if (!token) return null
  const now = Math.floor(Date.now() / 1000)
  return verifySession(token, now, env.SESSION_SECRET)
}
