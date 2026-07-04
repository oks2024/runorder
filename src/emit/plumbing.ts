/**
 * Shared pipeline-plumbing predicates — one source of truth for "which producer gets
 * schema-forced", used by both emitters and the editor's ENFORCED badge so the UI never
 * claims an enforcement the script emitter doesn't actually inject (guardrail #5).
 */
import type { PatternNode } from '@/spec/schema'

/** Does this node consume the previous phase's output as *items* (fan-out semantics)? */
export function consumesItems(node: PatternNode): boolean {
  return node.type === 'fanout' || node.type === 'mapReduce' || node.type === 'verify'
}

/**
 * Does this phase's output *already* hold an exact item array (no `{ context, items }`
 * forcing, no heuristic split needed downstream)? Fan-out and delegation yield the swarm's
 * output array; verify yields the surviving subset of the array it was fed; branches yield
 * one output per branch, in branch order.
 */
export function yieldsItemArray(node: PatternNode): boolean {
  return (
    node.type === 'fanout' ||
    node.type === 'verify' ||
    node.type === 'branches' ||
    (node.type === 'agent' && !!node.grants && node.grants.length > 0)
  )
}

/** Can this phase's terminal agent call carry FANOUT_SCHEMA (a single forceable producer)? */
export function schemaForcible(node: PatternNode): boolean {
  return (
    (node.type === 'agent' && !(node.grants && node.grants.length > 0)) ||
    node.type === 'mapReduce' ||
    node.type === 'multiAngle'
  )
}

/**
 * Is the phase at `index` forced to return `{ context, items }` because the next phase
 * fans out over it? (A delegation lead is forced too, but within its own phase — see the
 * script emitter's `agent`+grants branch.)
 */
export function isSchemaForced(phases: PatternNode[], index: number): boolean {
  return (
    schemaForcible(phases[index]) && index + 1 < phases.length && consumesItems(phases[index + 1])
  )
}
