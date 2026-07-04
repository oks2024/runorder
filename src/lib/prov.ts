/**
 * Provenance keys — the join between worksheet fields and emitted script lines.
 *
 * The receipt column's two-way hover needs a stable id shared by the field a user edits and
 * the exact script line(s) it produces. That id is a provenance key: `"<nodeId>:<field>"` for
 * per-node fields, plus two spec-level constants (workflow name, caps sentence). This one
 * module is imported by BOTH the deterministic script emitter (which stamps keys onto its
 * line records) and the Studio UI (which lights the matching field/lines) so the mapping can
 * never drift between the two sides.
 */

/** A per-node worksheet field. The numbered variants are a pattern's non-primary roles —
 *  `model2`/`prompt2` is the secondary (reduce / critic / judge / vote / grantee), and a
 *  branches phase numbers each branch after the first (`prompt3`, `model3`, …); `grant-cap`
 *  is A+ delegation's cap; `votes` is verify's per-item jury size. */
export type ProvField =
  | 'model'
  | 'prompt'
  | 'reads'
  | 'cap'
  | 'iters'
  | 'angles'
  | 'votes'
  | 'schema'
  | 'grant-cap'
  | `model${number}`
  | `prompt${number}`

/** The workflow name (masthead). Spec-level, so it has no node id. */
export const PROV_NAME = 'name'
/** The caps sentence (lede). Spec-level, so it has no node id. */
export const PROV_CAPS = 'caps'

/** The provenance key for a node's field: `"<nodeId>:<field>"`. */
export function provKey(nodeId: string, field: ProvField): string {
  return `${nodeId}:${field}`
}
