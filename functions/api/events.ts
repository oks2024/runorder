/**
 * `POST /api/events` — first-party analytics ingest.
 *
 * Deliberately *unauthenticated*: most of the product's usage is anonymous visitors in the
 * editor, and they are exactly who we want to count. A signed-in session, if present, is
 * attributed (`user_id`); everyone else is counted only via the daily-rotating `visitor` hash,
 * which carries no durable identity (see `_lib/analytics`).
 *
 * Guards run in the same cheap-to-reject order as the other write routes: size before parse,
 * parse before validate, validate before any DB work. The response is always `204 No Content`
 * (or a 4xx on a malformed body) — a beacon has nothing to consume, and we never leak whether
 * a session was recognized.
 */
import type { Env } from './_lib/env'
import { errorJson } from './_lib/http'
import { getSessionUserId } from './_lib/session'
import {
  cleanEvent,
  dayStamp,
  visitorHash,
  MAX_EVENT_BYTES,
} from './_lib/analytics'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // (1) Size gate — reject before we ever parse.
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_EVENT_BYTES) {
    return errorJson('Event too large.', 413)
  }

  // (2) Parse gate.
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return errorJson('Not valid JSON.', 400)
  }

  // (3) Validate + clamp gate.
  const checked = cleanEvent(body)
  if (!checked.ok) return errorJson(checked.error, 400)
  const event = checked.event

  // Attribute to a signed-in user when the session cookie is valid; otherwise anonymous.
  const userId = await getSessionUserId(request, env)

  // Reconstruct a cookieless, daily-rotating visitor id from coarse request signals.
  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  const ua = request.headers.get('User-Agent') ?? ''
  const day = dayStamp(Date.now())
  const visitor = await visitorHash(ip, ua, day, env.SESSION_SECRET)

  await env.DB.prepare(
    `INSERT INTO events (name, path, props, user_id, visitor)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(event.name, event.path, event.props, userId, visitor)
    .run()

  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
