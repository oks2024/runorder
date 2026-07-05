/**
 * `/api/workflows` — the owner's collection: list (GET) and save (POST).
 *
 * Both require a session. Listing returns metadata only (never the spec bodies) so the SPA's
 * "Saved" menu is cheap. Saving is an upsert keyed on `(owner_id, name)` — the workflow's
 * identity is its name (guardrail: one spec ⇄ one name), so re-saving under the same name
 * updates the existing row in place (a "live link"), preserving its id and public flag.
 *
 * POST guards run in a deliberate order so a hostile payload is cheap to reject: size before
 * parse, parse before validate, validate before any DB work.
 */
import type { Env } from '../_lib/env'
import { json, errorJson } from '../_lib/http'
import { requireUser } from '../_lib/guard'
import { checkIncomingSpec, MAX_SPEC_BYTES } from '../_lib/spec'
import { newSlug } from '../_lib/slug'
import type { WorkflowMeta } from '../_lib/db'

/** A `workflows` row projected to just the columns the meta shape needs. */
interface MetaRow {
  id: string
  name: string
  is_public: number
  updated_at: string
}

/** Project a raw meta row into the client-facing `WorkflowMeta`. */
function metaFromRow(row: MetaRow): WorkflowMeta {
  return {
    id: row.id,
    name: row.name,
    isPublic: row.is_public === 1,
    updatedAt: row.updated_at,
  }
}

/** Max workflows a single owner may keep. */
const OWNER_LIMIT = 100

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const gate = await requireUser(context)
  if (gate instanceof Response) return gate
  const userId = gate

  const { results } = await context.env.DB.prepare(
    `SELECT id, name, is_public, updated_at
     FROM workflows WHERE owner_id = ?1 ORDER BY updated_at DESC`,
  )
    .bind(userId)
    .all<MetaRow>()

  return json({ workflows: results.map(metaFromRow) })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const gate = await requireUser(context)
  if (gate instanceof Response) return gate
  const userId = gate

  // (1) Size gate — reject before we ever parse.
  const raw = await context.request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_SPEC_BYTES) {
    return errorJson('Workflow too large.', 413)
  }

  // (2) Parse gate.
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return errorJson('Not valid JSON.', 400)
  }
  const incoming =
    body && typeof body === 'object' && 'spec' in body
      ? (body as { spec: unknown }).spec
      : undefined

  // (3) Validate gate — reuse the app's single validation pipeline.
  const checked = checkIncomingSpec(incoming)
  if (!checked.ok) return errorJson(checked.error, 400)
  const spec = checked.spec
  const specJson = JSON.stringify(spec)

  const db = context.env.DB

  // (4a) Upsert-by-name: if a row already exists for (owner, name), update it in place —
  // id and is_public are intentionally left untouched (live-link semantics).
  const updated = await db
    .prepare(
      `UPDATE workflows
       SET spec_json = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE owner_id = ?2 AND name = ?3
       RETURNING id, name, is_public, updated_at`,
    )
    .bind(specJson, userId, spec.name)
    .first<MetaRow>()

  if (updated) return json({ workflow: metaFromRow(updated) })

  // (4b) New workflow — enforce the per-owner cap, then insert with a fresh slug.
  const countRow = await db
    .prepare('SELECT COUNT(*) AS c FROM workflows WHERE owner_id = ?1')
    .bind(userId)
    .first<{ c: number }>()
  if ((countRow?.c ?? 0) >= OWNER_LIMIT) {
    return errorJson('Workflow limit reached (100).', 409)
  }

  const insert = (id: string) =>
    db
      .prepare(
        `INSERT INTO workflows (id, owner_id, name, spec_json)
         VALUES (?1, ?2, ?3, ?4)
         RETURNING id, name, is_public, updated_at`,
      )
      .bind(id, userId, spec.name, specJson)
      .first<MetaRow>()

  let inserted: MetaRow | null
  try {
    inserted = await insert(newSlug())
  } catch {
    // Astronomically rare slug PK collision — retry once with a fresh slug.
    inserted = await insert(newSlug())
  }
  if (!inserted) return errorJson('Could not save workflow.', 500)

  return json({ workflow: metaFromRow(inserted) })
}
