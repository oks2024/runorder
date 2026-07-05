// @vitest-environment node
/**
 * Session token tests — the security-load-bearing part of auth.
 *
 * These exercise the pure, time-injected `signSession` / `verifySession` so the assertions
 * are deterministic. The threat model is forgery and replay: every mutation of a valid token
 * (userId, expiry, signature) must fail verification, and an expired token must fail too.
 */
import { describe, it, expect } from 'vitest'
import { signSession, verifySession, parseCookies } from './session'

const SECRET = 'test-secret-value'
const NOW = 1_700_000_000
const LATER = NOW + 3600

describe('signSession / verifySession', () => {
  it('round-trips a signed token back to its user id', async () => {
    const token = await signSession(42, LATER, SECRET)
    expect(await verifySession(token, NOW, SECRET)).toBe(42)
  })

  it('rejects a tampered user id', async () => {
    const token = await signSession(42, LATER, SECRET)
    const forged = token.replace(/^42\./, '43.')
    expect(await verifySession(forged, NOW, SECRET)).toBeNull()
  })

  it('rejects a tampered expiry', async () => {
    const token = await signSession(42, LATER, SECRET)
    const [uid, , sig] = token.split('.')
    const forged = `${uid}.${LATER + 10000}.${sig}`
    expect(await verifySession(forged, NOW, SECRET)).toBeNull()
  })

  it('rejects a tampered signature', async () => {
    const token = await signSession(42, LATER, SECRET)
    const parts = token.split('.')
    // Flip a character in the signature segment (keep it base64url-legal).
    const sig = parts[2]
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    expect(await verifySession(`${parts[0]}.${parts[1]}.${flipped}`, NOW, SECRET)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(42, LATER, SECRET)
    expect(await verifySession(token, NOW, 'other-secret')).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signSession(42, NOW - 1, SECRET)
    expect(await verifySession(token, NOW, SECRET)).toBeNull()
  })

  it('rejects malformed tokens (part count / non-numeric fields)', async () => {
    expect(await verifySession('', NOW, SECRET)).toBeNull()
    expect(await verifySession('42.9999999999', NOW, SECRET)).toBeNull()
    expect(await verifySession('42.9999999999.sig.extra', NOW, SECRET)).toBeNull()
    expect(await verifySession('abc.9999999999.sig', NOW, SECRET)).toBeNull()
    expect(await verifySession('42.notanumber.sig', NOW, SECRET)).toBeNull()
    expect(await verifySession('42.9999999999.not_base64!', NOW, SECRET)).toBeNull()
  })
})

describe('parseCookies', () => {
  it('parses a multi-cookie header, trimming whitespace', () => {
    expect(parseCookies('ro_session=abc; other=def')).toEqual({
      ro_session: 'abc',
      other: 'def',
    })
  })

  it('returns an empty map for a missing header', () => {
    expect(parseCookies(null)).toEqual({})
  })
})
