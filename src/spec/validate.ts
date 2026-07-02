/**
 * Graph-level validation — the rules Zod can't express.
 *
 * Zod (schema.ts) already guarantees the tree shape and caps bounds. The only real graph
 * check in V1 is **no dangling `AgentRef`**: every ref must resolve to a defined agent id.
 *
 * Cycle detection is now real for A+ `Grant` delegation: each grant is an edge
 * `leadAgent → grantedAgent`, and a cycle in that directed graph (including a self-grant)
 * would be an unbounded delegation loop. The plain `sequence`/`fanout` tree still has no
 * back-edges, so specs without grants never trip this.
 */
import type { PatternNode, WorkflowSpec, AgentRef } from './schema'

export interface ValidationIssue {
  code: 'dangling-ref' | 'delegation-cycle'
  message: string
  /** The offending agent ref (unresolved, or a node on the delegation cycle). */
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

/** Collect delegation edges `leadAgent → grantedAgent` from every agent-node with grants. */
function collectGrantEdges(node: PatternNode, acc: Array<[AgentRef, AgentRef]>): void {
  switch (node.type) {
    case 'sequence':
      node.steps.forEach((s) => collectGrantEdges(s, acc))
      break
    case 'iterateUntil':
      collectGrantEdges(node.body, acc)
      break
    case 'agent':
      node.grants?.forEach((g) => acc.push([node.agent, g.agent]))
      break
    // fanout/mapReduce/adversarial/multiAngle carry no grants.
  }
}

/** Return one agent id on a delegation cycle (incl. a self-grant), or null if acyclic. */
function firstDelegationCycle(edges: Array<[AgentRef, AgentRef]>): AgentRef | null {
  const adj = new Map<AgentRef, AgentRef[]>()
  for (const [from, to] of edges) {
    const list = adj.get(from) ?? []
    list.push(to)
    adj.set(from, list)
  }
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2
  const color = new Map<AgentRef, number>()
  let found: AgentRef | null = null

  const visit = (u: AgentRef): void => {
    if (found) return
    color.set(u, GRAY)
    for (const v of adj.get(u) ?? []) {
      if (found) return
      if (v === u || color.get(v) === GRAY) {
        found = v
        return
      }
      if ((color.get(v) ?? WHITE) === WHITE) visit(v)
    }
    color.set(u, BLACK)
  }

  for (const start of adj.keys()) {
    if ((color.get(start) ?? WHITE) === WHITE) visit(start)
    if (found) break
  }
  return found
}

/**
 * Validate the graph rules over an already-schema-valid spec.
 * Returns all dangling-ref and delegation-cycle issues (or `{ ok: true }`).
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

  const edges: Array<[AgentRef, AgentRef]> = []
  collectGrantEdges(spec.root, edges)
  const cycleAgent = firstDelegationCycle(edges)
  if (cycleAgent !== null) {
    issues.push({
      code: 'delegation-cycle',
      ref: cycleAgent,
      message: `Delegation cycle through agent "${cycleAgent}" — a grant chain loops back on itself.`,
    })
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
