/**
 * Cloudflare Turnstile server-side verification — the human check before going public.
 *
 * A Turnstile widget on the client yields a one-time token; this exchanges it with the
 * siteverify endpoint (keyed on the secret) for a pass/fail. We include `remoteip` when the
 * caller can supply it (`CF-Connecting-IP`) to strengthen the check. Any transport error or
 * non-`success` response is treated as a failure — verification is fail-closed.
 *
 * The request is form-encoded, which siteverify accepts and which sidesteps any JSON-body
 * content-type quirks.
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface SiteverifyResponse {
  success?: boolean
}

/** Verify a Turnstile token; `true` only on a confirmed `success`. Fail-closed on any error. */
export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
): Promise<boolean> {
  const form = new URLSearchParams()
  form.set('secret', secret)
  form.set('response', token)
  if (remoteIp) form.set('remoteip', remoteIp)

  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body: form })
    if (!res.ok) return false
    const data = (await res.json()) as SiteverifyResponse
    return data.success === true
  } catch {
    return false
  }
}
