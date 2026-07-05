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
import { workflowSpecSchema, type WorkflowSpec } from '../spec/schema'
import { validateSpec } from '../spec/validate'

/** On-disk format version. Bump only on a breaking change to the file envelope. */
export const FILE_VERSION = 1

/** The exported file envelope. `spec` carries its own `name`. */
export interface RunorderFile {
  runorder: number
  spec: WorkflowSpec
}

export type ImportResult =
  | { ok: true; spec: WorkflowSpec }
  | { ok: false; error: string }

/** Serialize the live spec to pretty JSON for download. */
export function serializeSpec(spec: WorkflowSpec): string {
  const file: RunorderFile = { runorder: FILE_VERSION, spec }
  return JSON.stringify(file, null, 2)
}

/**
 * Parse + fully validate an imported blob into a loadable spec, or a human-readable error.
 *
 * Accepts the wrapped envelope (`{ runorder, spec }`, or the pre-rename `{ playsheet, spec }`
 * / `{ prewire, spec }`) as well as a bare spec object, so a hand-written or older JSON still
 * imports. Never throws —
 * every failure path returns `{ ok: false, error }`.
 */
export function parseImport(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Not valid JSON.' }
  }
  return validateSpecValue(raw)
}

/**
 * Validate an already-parsed value into a loadable spec, or a human-readable error.
 *
 * This is the two-stage import pipeline (unwrap envelope → Zod `safeParse` shape/caps →
 * `validateSpec` graph rules) lifted out of `parseImport` so callers that already hold a
 * parsed value — a request body decoded by the backend, say — can reuse the exact same
 * contract (and the exact same error strings) without a JSON round-trip.
 */
export function validateSpecValue(candidate: unknown): ImportResult {
  const unwrapped = unwrap(candidate)

  const parsed = workflowSpecSchema.safeParse(unwrapped)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Not a valid workflow: ${firstZodMessage(parsed.error)}`,
    }
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

/**
 * Structural equality of two specs — the "has the live rundown diverged from its saved
 * entry?" check. Key-order-insensitive and treats `undefined`-valued keys as absent, because
 * one side may have round-tripped through Zod/localStorage and the other may be a literal.
 */
export function specsEqual(a: WorkflowSpec, b: WorkflowSpec): boolean {
  return deepEqual(a, b)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = definedKeys(a)
    const kb = definedKeys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    )
  }
  return false
}

function definedKeys(obj: object): string[] {
  return Object.keys(obj).filter(
    (k) => (obj as Record<string, unknown>)[k] !== undefined,
  )
}

/** Peel the `{ runorder, spec }` envelope (or the pre-rename `{ playsheet, spec }` / `{ prewire, spec }`) if present; otherwise treat the value as a bare spec. */
function unwrap(raw: unknown): unknown {
  if (
    raw &&
    typeof raw === 'object' &&
    'spec' in raw &&
    ('runorder' in raw || 'playsheet' in raw || 'prewire' in raw)
  ) {
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
