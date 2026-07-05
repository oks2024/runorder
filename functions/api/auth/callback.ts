/**
 * `GET /api/auth/callback` — finish the GitHub OAuth dance and open a session.
 *
 * Steps: (1) verify the `state` GitHub echoed matches our `ro_oauth` cookie (CSRF gate);
 * (2) exchange `code` for a short-lived access token; (3) read the GitHub profile; (4) upsert
 * the user row; (5) 302 back to the stashed `returnTo`, planting the session cookie and
 * clearing the transient oauth cookie. The GitHub access token is used for exactly one
 * `/user` call and then discarded — never stored, never logged.
 */
import type { Env } from '../_lib/env'
import { errorJson } from '../_lib/http'
import { safeReturnTo } from '../_lib/redirect'
import {
  parseCookies,
  signSession,
  sessionCookie,
  SESSION_TTL_SECONDS,
} from '../_lib/session'
import { OAUTH_COOKIE } from './login'

interface GitHubTokenResponse {
  access_token?: string
}

interface GitHubUser {
  id: number
  login: string
  name: string | null
  avatar_url: string | null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // (1) CSRF gate: state must match the value we planted in the oauth cookie.
  const cookies = parseCookies(request.headers.get('Cookie'))
  const stashed = cookies[OAUTH_COOKIE]
  if (!code || !state || !stashed) {
    return errorJson('Invalid sign-in state.', 403)
  }
  const sep = stashed.indexOf(':')
  const cookieState = sep === -1 ? stashed : stashed.slice(0, sep)
  const returnTo = safeReturnTo(sep === -1 ? '/' : stashed.slice(sep + 1))
  if (cookieState !== state) {
    return errorJson('Invalid sign-in state.', 403)
  }

  // (2) Exchange the code for an access token.
  let accessToken: string
  try {
    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    )
    if (!tokenRes.ok) return errorJson('GitHub sign-in failed.', 502)
    const token = (await tokenRes.json()) as GitHubTokenResponse
    if (!token.access_token) return errorJson('GitHub sign-in failed.', 502)
    accessToken = token.access_token
  } catch {
    return errorJson('GitHub sign-in failed.', 502)
  }

  // (3) Read the GitHub profile. A User-Agent is mandatory — GitHub rejects UA-less requests.
  let profile: GitHubUser
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'runorder',
      },
    })
    if (!userRes.ok) return errorJson('GitHub sign-in failed.', 502)
    profile = (await userRes.json()) as GitHubUser
  } catch {
    return errorJson('GitHub sign-in failed.', 502)
  }

  // (4) Upsert the user, refreshing profile fields + last_login_at on return visits.
  const row = await env.DB.prepare(
    `INSERT INTO users (github_id, login, name, avatar_url)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(github_id) DO UPDATE SET
       login = excluded.login,
       name = excluded.name,
       avatar_url = excluded.avatar_url,
       last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     RETURNING id`,
  )
    .bind(profile.id, profile.login, profile.name ?? null, profile.avatar_url ?? null)
    .first<{ id: number }>()

  if (!row) return errorJson('GitHub sign-in failed.', 502)

  // (5) 302 home, setting the session cookie and clearing the transient oauth cookie.
  const now = Math.floor(Date.now() / 1000)
  const token = await signSession(row.id, now + SESSION_TTL_SECONDS, env.SESSION_SECRET)

  const headers = new Headers()
  headers.set('Location', returnTo)
  headers.set('Cache-Control', 'no-store')
  headers.append('Set-Cookie', sessionCookie(token, SESSION_TTL_SECONDS))
  headers.append(
    'Set-Cookie',
    `${OAUTH_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0`,
  )
  return new Response(null, { status: 302, headers })
}
