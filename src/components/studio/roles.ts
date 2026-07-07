/**
 * Per-phase role extraction for the rundown sentences.
 *
 * A thin, read-only mapping from a `PatternNode` to its Studio pattern key, its plain kind
 * label (the `.pnum` gutter), and its primary agent ref (used to pick the phase hue). Mirrors
 * the logic the mockup-7 `PhaseRow` inlined; M2's `nodeRoles.ts` will generalize this once the
 * store needs the same extraction. Kept UI-local for M1.
 */
import { PATTERN_INFO, type PatternKey } from '@/lib/patterns'
import { primaryRef as primaryRefOrNull } from '@/lib/nodeRoles'
import type { PatternNode } from '@/spec/schema'

/** Any composition node the rundown renders (everything except a nested sequence). */
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
    case 'refine':
      return 'refine'
    case 'verify':
      return 'verify'
    case 'branches':
      return 'branches'
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
  branches: 'branches',
  loop: 'loop',
  mapReduce: 'map-reduce',
  adversarial: 'adversarial',
  refine: 'refine',
  verify: 'verify',
  multiAngle: 'multi-angle',
  delegate: 'delegate',
}

/**
 * In→out signature shown under the kind label. Static per pattern, except branches — its
 * output count is structural (the script literally runs those k agents), so show the real k.
 */
export function ioLabel(node: EditableNode): string {
  if (node.type === 'branches') return `1→${node.branches.length}`
  return PATTERN_INFO[patternKeyOf(node)].io
}

/** The primary agent ref of a phase (the one that leads the sentence), or '' if unresolvable. */
export function primaryRef(node: EditableNode): string {
  return primaryRefOrNull(node) ?? ''
}
