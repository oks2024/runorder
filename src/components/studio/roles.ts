/**
 * Per-phase role extraction for the worksheet sentences.
 *
 * A thin, read-only mapping from a `PatternNode` to its Studio pattern key, its plain kind
 * label (the `.pnum` gutter), and its primary agent ref (used to pick the phase hue). Mirrors
 * the logic the mockup-7 `PhaseRow` inlined; M2's `nodeRoles.ts` will generalize this once the
 * store needs the same extraction. Kept UI-local for M1.
 */
import type { PatternKey } from '@/lib/patterns'
import type { PatternNode } from '@/spec/schema'

/** Any composition node the worksheet renders (everything except a nested sequence). */
export type EditableNode = Exclude<PatternNode, { type: 'sequence' }>

/** Classify a node into its Studio pattern key (a lead with grants is a delegation). */
export function patternKeyOf(node: EditableNode): PatternKey {
  switch (node.type) {
    case 'fanout':
      return 'fanout'
    case 'iterateUntil':
      return 'loop'
    case 'mapReduce':
      return 'mapReduce'
    case 'adversarial':
      return 'adversarial'
    case 'multiAngle':
      return 'multiAngle'
    case 'agent':
      return node.grants && node.grants.length > 0 ? 'delegate' : 'step'
  }
}

/** Plain lowercase kind label shown in the `.pnum` gutter. */
export const KIND_LABEL: Record<PatternKey, string> = {
  step: 'step',
  fanout: 'fan-out',
  loop: 'loop',
  mapReduce: 'map-reduce',
  adversarial: 'adversarial',
  multiAngle: 'multi-angle',
  delegate: 'delegate',
}

/** The primary agent ref of a phase (the one that leads the sentence), or '' if id-less. */
export function primaryRef(node: EditableNode): string {
  switch (node.type) {
    case 'iterateUntil':
      return node.body.type === 'agent' ? node.body.agent : ''
    case 'mapReduce':
      return node.map.agent
    case 'adversarial':
      return node.producer
    default:
      return node.agent // agent | fanout | multiAngle
  }
}
