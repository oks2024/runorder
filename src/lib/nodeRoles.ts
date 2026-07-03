/**
 * Node → agent-ref role extraction — one source of truth for "which agent plays the
 * primary/secondary role of a phase", and "which agent ids does the whole tree reference".
 *
 * Previously this switch was duplicated across the store (setPhaseAgent / setPhaseSecondary),
 * `memoryNames.ts` (a related-but-distinct output-agent mapping, intentionally left alone),
 * and the UI's `components/studio/roles.ts` (now re-pointed here). Lives in `lib/` so the
 * store and emitters can import it without reaching into the UI layer.
 */
import type { PatternNode, WorkflowSpec } from '@/spec/schema'

/**
 * The primary agent ref of a phase — the one that "leads" it:
 * step / fan-out / multi-angle → `agent`; loop → its body agent; map-reduce → `map.agent`;
 * adversarial → `producer`; delegate (agent + grants) → the lead `agent`.
 * Returns null when unresolvable (a `sequence`, or a loop whose body is not a single agent).
 */
export function primaryRef(node: PatternNode): string | null {
  switch (node.type) {
    case 'agent':
      return node.agent
    case 'fanout':
      return node.agent
    case 'multiAngle':
      return node.agent
    case 'mapReduce':
      return node.map.agent
    case 'adversarial':
      return node.producer
    case 'iterateUntil':
      return node.body.type === 'agent' ? node.body.agent : null
    default:
      return null // sequence
  }
}

/**
 * The secondary agent ref of a composite phase — map-reduce → `reduce`;
 * adversarial → `critic`; multi-angle → `vote`; delegate → first grant's agent.
 * Returns null for phases with no secondary role.
 */
export function secondaryRef(node: PatternNode): string | null {
  switch (node.type) {
    case 'mapReduce':
      return node.reduce
    case 'adversarial':
      return node.critic
    case 'multiAngle':
      return node.vote
    case 'agent':
      return node.grants && node.grants[0] ? node.grants[0].agent : null
    default:
      return null
  }
}

/**
 * Every agent id referenced anywhere in the spec's root tree — walking nested sequences and
 * loop bodies, and including *all* delegation grants (not just the first). The complement of
 * this set over `spec.agents` is exactly the unreferenced (GC-eligible) agents.
 */
export function referencedAgentIds(spec: WorkflowSpec): Set<string> {
  const ids = new Set<string>()
  const visit = (node: PatternNode): void => {
    switch (node.type) {
      case 'sequence':
        node.steps.forEach(visit)
        return
      case 'iterateUntil':
        visit(node.body)
        return
      case 'agent':
        ids.add(node.agent)
        node.grants?.forEach((g) => ids.add(g.agent))
        return
      case 'fanout':
        ids.add(node.agent)
        return
      case 'multiAngle':
        ids.add(node.agent)
        ids.add(node.vote)
        return
      case 'mapReduce':
        ids.add(node.map.agent)
        ids.add(node.reduce)
        return
      case 'adversarial':
        ids.add(node.producer)
        ids.add(node.critic)
        return
    }
  }
  visit(spec.root)
  return ids
}
