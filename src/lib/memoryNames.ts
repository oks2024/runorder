/**
 * Memory names — the human-readable labels for per-phase memories.
 *
 * Every root-sequence step's output is a named memory (see schema.ts `NodeBase`). The name
 * is derived, never stored: a slug of the agent whose output the phase actually yields
 * (fan-out → the worker, map-reduce → the reducer, multi-angle → the voter, delegation →
 * the grantee), deduped in phase order (`reviewer`, `reviewer-2`, …). Derived-only keeps
 * renames free: `reads` reference node *ids*; names re-derive on every render/emit.
 *
 * Used by both emitters (splice labels like `[reviewer]`) and the reads-picker UI, so the
 * label the user picks is byte-identical to the label the downstream agent sees.
 */
import type { PatternNode, WorkflowSpec } from '@/spec/schema'

export interface MemoryEntry {
  /** The root step's node id (undefined for id-less hand-written nodes — not readable). */
  nodeId?: string
  /** Deduped display/splice name. */
  name: string
}

/** The agent ref whose output describes what this phase's memory *contains*, or null. */
function outputAgentRef(node: PatternNode): string | null {
  switch (node.type) {
    case 'agent':
      // With a grant, the phase result is the grantee fan-out's outputs, not the lead's.
      return node.grants && node.grants[0] ? node.grants[0].agent : node.agent
    case 'fanout':
      return node.agent
    case 'mapReduce':
      return node.reduce
    case 'adversarial':
      return node.producer
    case 'multiAngle':
      return node.vote
    case 'refine':
      // The phase's memory is the accepted draft — the producer's output, not the verdict.
      return node.producer
    case 'verify':
      // The memory is the surviving subset of the previous phase's items; naming it after
      // the skeptic reads as "what survived <skeptic>" — the only agent this phase runs.
      return node.skeptic
    case 'iterateUntil':
      return node.body.type === 'agent' ? node.body.agent : null
    default:
      // `branches` has no single output agent — its name is derived in `deriveMemoryNames`
      // from every branch (see `branchLabels`); `sequence` has no memory at all.
      return null
  }
}

/** Lowercase kebab slug; empty input falls through to the caller's fallback. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Per-branch splice labels for a `branches` phase, in branch (= output array) order — the
 * `[label]` each branch's output wears when a later phase reads this memory. Shared by both
 * emitters and the rehearsal view so the label the user sees is the label the script splices.
 */
export function branchLabels(
  spec: WorkflowSpec,
  node: Extract<PatternNode, { type: 'branches' }>,
): string[] {
  return node.branches.map((ref, k) => {
    const agent = spec.agents.find((a) => a.id === ref)
    return (agent && slugify(agent.name)) || `branch-${k + 1}`
  })
}

/**
 * One entry per root step, in phase order. Names are unique: repeats get `-2`, `-3`, …
 * A dangling/unnamed output agent falls back to `phase-N`.
 */
export function deriveMemoryNames(spec: WorkflowSpec): MemoryEntry[] {
  const steps = spec.root.type === 'sequence' ? spec.root.steps : [spec.root]
  const used = new Map<string, number>()

  return steps.map((node, i) => {
    const ref = outputAgentRef(node)
    const agent = ref ? spec.agents.find((a) => a.id === ref) : null
    // A branches phase's memory holds every branch's output, so its name is all of them.
    const joined = node.type === 'branches' ? branchLabels(spec, node).join('+') : ''
    const base = joined || (agent && slugify(agent.name)) || `phase-${i + 1}`
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    const name = count === 1 ? base : `${base}-${count}`
    return { nodeId: 'id' in node ? node.id : undefined, name }
  })
}

/** Lookup map `nodeId → { name, phase index }` for reads resolution. */
export function memoryIndex(spec: WorkflowSpec): Map<string, { name: string; index: number }> {
  const map = new Map<string, { name: string; index: number }>()
  deriveMemoryNames(spec).forEach((entry, index) => {
    if (entry.nodeId) map.set(entry.nodeId, { name: entry.name, index })
  })
  return map
}
