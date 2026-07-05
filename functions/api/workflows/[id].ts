/**
 * `/api/workflows/:id` — read (GET) and delete (DELETE) a single workflow.
 *
 * Visibility rule, applied to both verbs: a *public* row is world-readable; a *private* row
 * is visible only to its owner. Everyone else — signed out or a different user — gets a
 * **404**, never a 403, so the endpoint never leaks that a private id exists. Delete is
 * owner-only regardless of public flag (same 404-for-others rule).
 */
import type { Env } from '../_lib/env'
import { json, errorJson } from '../_lib/http'
import { getSessionUserId } from '../_lib/session'
import type { WorkflowRow } from '../_lib/db'

/** Pages route params arrive as string | string[]; the `[id]` segment is a single value. */
function idParam(params: Record<string, string | string[]>): string {
  const v = params.id
  return Array.isArray(v) ? v[0] : v
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = idParam(context.params)
  const row = await context.env.DB.prepare(
    `SELECT id, owner_id, name, spec_json, is_public, updated_at
     FROM workflows WHERE id = ?1`,
  )
    .bind(id)
    .first<WorkflowRow>()

  if (!row) return errorJson('Not found.', 404)

  // Private rows require the requester to be the owner; anyone else 404s (no existence leak).
  if (row.is_public !== 1) {
    const userId = await getSessionUserId(context.request, context.env)
    if (userId !== row.owner_id) return errorJson('Not found.', 404)
  }

  return json({
    workflow: {
      id: row.id,
      name: row.name,
      isPublic: row.is_public === 1,
      spec: JSON.parse(row.spec_json),
      updatedAt: row.updated_at,
    },
  })
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = idParam(context.params)
  const row = await context.env.DB.prepare(
    'SELECT owner_id FROM workflows WHERE id = ?1',
  )
    .bind(id)
    .first<{ owner_id: number }>()

  if (!row) return errorJson('Not found.', 404)

  const userId = await getSessionUserId(context.request, context.env)
  if (userId !== row.owner_id) return errorJson('Not found.', 404)

  await context.env.DB.prepare('DELETE FROM workflows WHERE id = ?1')
    .bind(id)
    .run()

  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  })
}
