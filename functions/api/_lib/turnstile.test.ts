// @vitest-environment node
/**
 * Turnstile verification shape tests.
 *
 * We don't hit Cloudflare here — we stub `fetch` and assert the two things that matter: the
 * request carries the expected fields (secret, response, and remoteip when available), and the
 * boolean result is fail-closed (only a `{ success: true }` body verifies).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyTurnstile } from './turnstile'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Stub global fetch, returning `body` as JSON with `ok`, and capture the request. */
function stubFetch(ok: boolean, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok,
        json: async () => body,
      } as unknown as Response
    }),
  )
  return calls
}

describe('verifyTurnstile', () => {
  it('returns true on a success response and posts secret + response + remoteip', async () => {
    const calls = stubFetch(true, { success: true })
    const ok = await verifyTurnstile('tok', 'sekret', '203.0.113.7')
    expect(ok).toBe(true)

    expect(calls).toHaveLength(1)
    const form = calls[0].init?.body as URLSearchParams
    expect(form.get('secret')).toBe('sekret')
    expect(form.get('response')).toBe('tok')
    expect(form.get('remoteip')).toBe('203.0.113.7')
  })

  it('omits remoteip when not available', async () => {
    const calls = stubFetch(true, { success: true })
    await verifyTurnstile('tok', 'sekret', null)
    const form = calls[0].init?.body as URLSearchParams
    expect(form.has('remoteip')).toBe(false)
  })

  it('returns false when success is not true', async () => {
    stubFetch(true, { success: false })
    expect(await verifyTurnstile('tok', 'sekret', null)).toBe(false)
  })

  it('returns false on a non-ok HTTP response', async () => {
    stubFetch(false, { success: true })
    expect(await verifyTurnstile('tok', 'sekret', null)).toBe(false)
  })

  it('returns false (fail-closed) when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    expect(await verifyTurnstile('tok', 'sekret', null)).toBe(false)
  })
})
