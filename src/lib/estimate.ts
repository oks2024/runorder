/**
 * Rough run-size estimate — an *estimate*, never a guarantee (fan-out is dynamic-N).
 *
 * Sums the agents a run could spawn: a step is 1, a fan-out is up to its `cap`. The caps
 * band surfaces this as "≤ N agents" with an ESTIMATE tag, deliberately distinct from the
 * INTENDED caps. For the seed: 1 (reviewer) + 8 (fan-out cap) + 1 (synthesizer) = 10.
 */
import type { PatternNode, WorkflowSpec } from '@/spec/schema'

function nodeSize(node: PatternNode): number {
  switch (node.type) {
    case 'agent':
      return 1
    case 'fanout':
      return node.cap
    case 'sequence':
      return node.steps.reduce((sum, s) => sum + nodeSize(s), 0)
    case 'mapReduce':
      return node.map.cap + 1
    case 'adversarial':
      return 2
    case 'multiAngle':
      return node.angles + 1
    case 'iterateUntil':
      return nodeSize(node.body) * node.maxIter
  }
}

/** Upper-bound estimate of agents spawned by a run (clamped to the total cap). */
export function estimateRunSize(spec: WorkflowSpec): number {
  return Math.min(nodeSize(spec.root), spec.caps.total)
}
