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
