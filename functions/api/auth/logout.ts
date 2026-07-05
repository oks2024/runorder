/**
 * `POST /api/auth/logout` — end the session.
 *
 * Sessions are stateless (signed cookies), so logging out is simply overwriting the cookie
 * with an immediately-expiring one; there is no server record to delete. 204, empty body.
 */
import type { Env } from '../_lib/env'
import { clearSessionCookie } from '../_lib/session'

export const onRequestPost: PagesFunction<Env> = () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': clearSessionCookie(),
      'Cache-Control': 'no-store',
    },
  })
}
