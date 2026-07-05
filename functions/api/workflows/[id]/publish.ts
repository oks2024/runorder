/**
 * `POST /api/workflows/:id/publish` — flip a workflow's public flag.
 *
 * Owner-only (a non-owner, signed in or not, gets 404 — same no-leak rule as reads). Going
 * *public* is the sensitive direction, so it demands a passing Turnstile check to keep the
 * public gallery from being flooded by bots; going *private* asks nothing. On success we
 * return the new flag so the client can reflect it without a re-fetch.
 */
import type { Env } from '../../_lib/env'
import { json, errorJson } from '../../_lib/http'
import { getSessionUserId } from '../../_lib/session'
import { verifyTurnstile } from '../../_lib/turnstile'

interface PublishBody {
  public?: unknown
  turnstileToken?: unknown
}

function idParam(params: Record<string, string | string[]>): string {
  const v = params.id
  return Array.isArray(v) ? v[0] : v
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const id = idParam(context.params)

  const row = await env.DB.prepare('SELECT owner_id FROM workflows WHERE id = ?1')
    .bind(id)
    .first<{ owner_id: number }>()
  if (!row) return errorJson('Not found.', 404)

  const userId = await getSessionUserId(request, env)
  if (userId !== row.owner_id) return errorJson('Not found.', 404)

  let body: PublishBody
  try {
    body = (await request.json()) as PublishBody
  } catch {
    return errorJson('Not valid JSON.', 400)
  }
  if (typeof body.public !== 'boolean') {
    return errorJson('Invalid request.', 400)
  }
  const makePublic = body.public

  // Going public requires a passing human check; going private does not.
  if (makePublic) {
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : ''
    const ok =
      token !== '' &&
      (await verifyTurnstile(
        token,
        env.TURNSTILE_SECRET_KEY,
        request.headers.get('CF-Connecting-IP'),
      ))
    if (!ok) return errorJson('Verification failed. Please retry.', 400)
  }

  await env.DB.prepare('UPDATE workflows SET is_public = ?1 WHERE id = ?2')
    .bind(makePublic ? 1 : 0, id)
    .run()

  return json({ workflow: { id, isPublic: makePublic } })
}
