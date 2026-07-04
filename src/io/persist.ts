/**
 * Serialization boundary for save/export/import — the JSON file format for a `WorkflowSpec`.
 *
 * Pure functions only (no DOM, no stores) so they unit-test in isolation; the browser file
 * plumbing (download / file-pick) lives in `download.ts`. Per guardrail #1 the spec model is
 * the single source of truth — this is a *serialization of the model*, one file ⇄ one spec.
 * The workflow's identity is `spec.name`, which travels inside the serialized spec.
 *
 * Import is deliberately two-stage: Zod `safeParse` (shape + caps bounds) THEN `validateSpec`
 * (graph rules Zod can't express — dangling refs, cycles, reads). Both must pass; a file that
 * clears only the first is still not a loadable spec.
 */
import { workflowSpecSchema, type WorkflowSpec } from '@/spec/schema'
import { validateSpec } from '@/spec/validate'

/** On-disk format version. Bump only on a breaking change to the file envelope. */
export const FILE_VERSION = 1

/** The exported file envelope. `spec` carries its own `name`. */
export interface PrewireFile {
  prewire: number
  spec: WorkflowSpec
}

export type ImportResult =
  | { ok: true; spec: WorkflowSpec }
  | { ok: false; error: string }

/** Serialize the live spec to pretty JSON for download. */
export function serializeSpec(spec: WorkflowSpec): string {
  const file: PrewireFile = { prewire: FILE_VERSION, spec }
  return JSON.stringify(file, null, 2)
}

/**
 * Parse + fully validate an imported blob into a loadable spec, or a human-readable error.
 *
 * Accepts either the wrapped envelope (`{ prewire, spec }`) or a bare spec object, so a
 * hand-written or older bare-spec JSON still imports. Never throws — every failure path
 * returns `{ ok: false, error }`.
 */
export function parseImport(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not valid JSON.' }
  }

  const candidate = unwrap(raw)

  const parsed = workflowSpecSchema.safeParse(candidate)
  if (!parsed.success) {
    return { ok: false, error: `Not a valid workflow: ${firstZodMessage(parsed.error)}` }
  }

  const graph = validateSpec(parsed.data)
  if (!graph.ok) {
    return { ok: false, error: `Invalid workflow: ${graph.issues[0].message}` }
  }

  return { ok: true, spec: parsed.data }
}

/** Suggested download filename: a kebab slug of the workflow name + `.json`. */
export function specFilename(spec: WorkflowSpec): string {
  const slug =
    spec.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workflow'
  return `${slug}.json`
}

/** Peel the `{ prewire, spec }` envelope if present; otherwise treat the value as a bare spec. */
function unwrap(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'spec' in raw && 'prewire' in raw) {
    return (raw as { spec: unknown }).spec
  }
  return raw
}

/** First Zod issue as a compact `path: message` string. */
function firstZodMessage(error: import('zod').ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'unknown error'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}
