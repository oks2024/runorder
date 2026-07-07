/**
 * `requireUser` — the one-line auth gate shared by every protected handler.
 *
 * Handlers stay flat by calling this first: it returns either the numeric user id (signed in)
 * or a ready-to-return 401 `Response`. The `instanceof Response` check at the call site is the
 * whole ceremony — no thrown control flow, no middleware framework.
 */
import type { Env } from './env'
import { errorJson } from './http'
import { getSessionUserId } from './session'

/** Resolve the session user id, or a 401 `Response` to return immediately. */
export async function requireUser(ctx: {
  request: Request
  env: Env
}): Promise<number | Response> {
  const userId = await getSessionUserId(ctx.request, ctx.env)
  if (userId === null) return errorJson('Sign in required.', 401)
  return userId
}

/** Parse the `ADMIN_LOGINS` env (comma-separated) into a lowercase login set. */
export function adminLogins(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_LOGINS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Gate a handler to admins: a valid session *and* a GitHub login listed in `ADMIN_LOGINS`.
 * Returns the numeric user id, or a ready-to-return 401 (no session) / 403 (not an admin).
 * A route that returns aggregate data across all users must not be reachable by any signed-in
 * user, so this is a deliberately separate, stricter gate than `requireUser`.
 */
export async function requireAdmin(ctx: {
  request: Request
  env: Env
}): Promise<number | Response> {
  const gate = await requireUser(ctx)
  if (gate instanceof Response) return gate
  const allow = adminLogins(ctx.env)
  if (allow.size === 0) return errorJson('Forbidden.', 403)
  const row = await ctx.env.DB.prepare('SELECT login FROM users WHERE id = ?1')
    .bind(gate)
    .first<{ login: string }>()
  if (!row || !allow.has(row.login.toLowerCase())) {
    return errorJson('Forbidden.', 403)
  }
  return gate
}
