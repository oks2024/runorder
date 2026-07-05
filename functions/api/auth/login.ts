/**
 * `GET /api/auth/login` — start the GitHub OAuth dance.
 *
 * We mint a random `state`, stash it (with the caller's `returnTo`) in a short-lived,
 * `Path=/api/auth`-scoped cookie, and 302 the browser to GitHub's authorize screen. The
 * state cookie is the CSRF defense: the callback only proceeds if the `state` GitHub echoes
 * back matches the one we planted. `returnTo` is validated to a same-origin path so this
 * endpoint can't be turned into an open redirect.
 *
 * `redirect_uri` is derived from the request origin (never hardcoded) so the same code works
 * on localhost, previews, and prod. No `scope` is requested — the default public-profile read
 * is all `/user` needs.
 */
import type { Env } from '../_lib/env'
import { safeReturnTo } from '../_lib/redirect'

/** The transient cookie holding `state:returnTo` between authorize and callback. */
export const OAUTH_COOKIE = 'ro_oauth'

export const onRequestGet: PagesFunction<Env> = (context) => {
  const url = new URL(context.request.url)
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))

  const stateBytes = new Uint8Array(16)
  crypto.getRandomValues(stateBytes)
  const state = [...stateBytes].map((b) => b.toString(16).padStart(2, '0')).join('')

  const redirectUri = `${url.origin}/api/auth/callback`
  const authorize = new URL('https://github.com/login/oauth/authorize')
  authorize.searchParams.set('client_id', context.env.GITHUB_CLIENT_ID)
  authorize.searchParams.set('redirect_uri', redirectUri)
  authorize.searchParams.set('state', state)

  const cookie = `${OAUTH_COOKIE}=${state}:${returnTo}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': cookie,
      'Cache-Control': 'no-store',
    },
  })
}
