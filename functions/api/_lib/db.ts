/**
 * D1 row shapes and mappers — the boundary between SQLite snake_case and app camelCase.
 *
 * The row interfaces mirror the columns in `migrations/0001_init.sql` exactly (snake_case,
 * SQLite affinities: INTEGER → number, TEXT → string, nullable TEXT → `string | null`).
 * `is_public` is stored as 0/1. Mappers convert a raw row into the camelCase shape the API
 * returns to the client; keep them dumb (no I/O) so they stay trivially testable.
 */

/** A row of the `users` table. */
export interface UserRow {
  id: number
  github_id: number
  login: string
  name: string | null
  avatar_url: string | null
  created_at: string
  last_login_at: string
}

/** A row of the `workflows` table. */
export interface WorkflowRow {
  id: string
  owner_id: number
  name: string
  spec_json: string
  is_public: number
  created_at: string
  updated_at: string
}

/** The client-facing summary of a workflow (no spec body, no owner id). */
export interface WorkflowMeta {
  id: string
  name: string
  isPublic: boolean
  updatedAt: string
}

/** Project a `workflows` row down to its client-facing metadata. */
export function toWorkflowMeta(row: WorkflowRow): WorkflowMeta {
  return {
    id: row.id,
    name: row.name,
    isPublic: row.is_public === 1,
    updatedAt: row.updated_at,
  }
}
