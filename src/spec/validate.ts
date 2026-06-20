/**
 * Graph-level validation — the rules Zod can't express.
 *
 * Zod (schema.ts) already guarantees the tree shape and caps bounds. The only real graph
 * check in V1 is **no dangling `AgentRef`**: every ref must resolve to a defined agent id.
 *
 * Cycle detection is an explicit **no-op** in V1: a `sequence`/`fanout` tree has no
 * back-edges, so a cycle is structurally impossible. It becomes real only when A+ `Grant`
 * delegation lands (a node may then point back at an ancestor). Kept here as a documented
 * seam, not implemented.
 */
import type { PatternNode, WorkflowSpec, AgentRef } from './schema'

export interface ValidationIssue {
  code: 'dangling-ref'
  message: string
  /** The unresolved agent ref. */
  ref: AgentRef
}

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] }

/** Collect every `AgentRef` reachable from a node (depth-first, all pattern types). */
function collectRefs(node: PatternNode, acc: AgentRef[]): void {
  switch (node.type) {
    case 'sequence':
      node.steps.forEach((s) => collectRefs(s, acc))
      break
    case 'fanout':
      acc.push(node.agent)
      break
    case 'mapReduce':
      acc.push(node.map.agent, node.reduce)
      break
    case 'adversarial':
      acc.push(node.producer, node.critic)
      break
    case 'multiAngle':
      acc.push(node.agent, node.vote)
      break
    case 'iterateUntil':
      collectRefs(node.body, acc)
      break
    case 'agent':
      acc.push(node.agent)
      node.grants?.forEach((g) => acc.push(g.agent))
      break
  }
}

/**
 * Validate the graph rules over an already-schema-valid spec.
 * Returns all dangling-ref issues (or `{ ok: true }`).
 */
export function validateSpec(spec: WorkflowSpec): ValidationResult {
  const defined = new Set(spec.agents.map((a) => a.id))

  const refs: AgentRef[] = []
  collectRefs(spec.root, refs)

  const seen = new Set<AgentRef>()
  const issues: ValidationIssue[] = []
  for (const ref of refs) {
    if (defined.has(ref) || seen.has(ref)) continue
    seen.add(ref)
    issues.push({
      code: 'dangling-ref',
      ref,
      message: `Agent ref "${ref}" does not resolve to any defined agent.`,
    })
  }

  // Cycle detection: intentional no-op in V1 (see file header).

  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
