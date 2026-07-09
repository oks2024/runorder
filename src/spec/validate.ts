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
 *
 * Explicit context flow adds two more rules: root node ids must be unique, and every
 * `reads` entry must resolve to an EARLIER root step's id (see `collectReadsIssues`).
 */
import type { PatternNode, WorkflowSpec, AgentRef } from './schema'

export interface ValidationIssue {
  code:
    | 'dangling-ref'
    | 'delegation-cycle'
    | 'dangling-read'
    | 'duplicate-node-id'
    | 'blank-input-label'
  message: string
  /**
   * The offending ref: an agent ref, a read target node id, a duplicated node id, or the
   * blank launch-input label.
   */
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
    case 'refine':
      acc.push(node.producer, node.critic)
      break
    case 'verify':
      acc.push(node.skeptic)
      break
    case 'branches':
      acc.push(...node.branches)
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
    // fanout/mapReduce/adversarial/multiAngle/refine/verify/branches carry no grants.
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
 * Reads rules over the root phase list: node ids must be unique, and every `reads` entry
 * must resolve to the id of an EARLIER root step (no self/forward reads — a memory only
 * exists once its phase has run). Reorder/remove can break reads on purpose; this is the
 * pass that surfaces it (same philosophy as dangling agent refs).
 */
function collectReadsIssues(spec: WorkflowSpec, issues: ValidationIssue[]): void {
  const steps = spec.root.type === 'sequence' ? spec.root.steps : [spec.root]

  const seen = new Set<string>()
  const reported = new Set<string>()
  for (const node of steps) {
    const id = 'id' in node ? node.id : undefined
    if (!id) continue
    if (seen.has(id) && !reported.has(id)) {
      reported.add(id)
      issues.push({
        code: 'duplicate-node-id',
        ref: id,
        message: `Node id "${id}" is used by more than one phase — reads targeting it are ambiguous.`,
      })
    }
    seen.add(id)
  }

  const earlier = new Set<string>()
  const badReads = new Set<string>()
  for (const node of steps) {
    const reads = 'reads' in node ? node.reads : undefined
    for (const target of reads ?? []) {
      if (!earlier.has(target) && !badReads.has(target)) {
        badReads.add(target)
        issues.push({
          code: 'dangling-read',
          ref: target,
          message: `Read "${target}" does not resolve to an earlier phase — a memory only exists once its phase has run.`,
        })
      }
    }
    const id = 'id' in node ? node.id : undefined
    if (id) earlier.add(id)
  }
}

/**
 * Validate the graph rules over an already-schema-valid spec.
 * Returns all dangling-ref, delegation-cycle, and reads issues (or `{ ok: true }`).
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

  collectReadsIssues(spec, issues)

  // A launch input with a blank name is authored-but-unusable: its `[label]` block would be
  // empty. Shape-valid (see schema.ts) so an in-progress edit persists, but flagged here.
  if (spec.input && !spec.input.label.trim()) {
    issues.push({
      code: 'blank-input-label',
      ref: spec.input.label,
      message: 'The launch input needs a name — its [label] block would otherwise be empty.',
    })
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
