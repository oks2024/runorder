/**
 * `GET /api/me` — the current-user probe the SPA calls on load to know if it's signed in.
 *
 * Always 200 (never 401) so the client can treat "signed out" as a normal state, not an
 * error: `{ user: null }` when there is no valid session, `{ user: {...} }` when there is. A
 * cookie whose signature verifies but whose user row no longer exists (deleted account) is
 * treated as signed out.
 */
import type { Env } from './_lib/env'
import { json } from './_lib/http'
import type { UserRow } from './_lib/db'
import { getSessionUserId } from './_lib/session'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const userId = await getSessionUserId(context.request, context.env)
  if (userId === null) return json({ user: null })

  const row = await context.env.DB.prepare(
    'SELECT login, name, avatar_url FROM users WHERE id = ?1',
  )
    .bind(userId)
    .first<Pick<UserRow, 'login' | 'name' | 'avatar_url'>>()

  if (!row) return json({ user: null })

  return json({
    user: { login: row.login, name: row.name, avatarUrl: row.avatar_url },
  })
}
