/**
 * The `code-review-loop` example — the workflow every mockup renders, and the spec the
 * MVP drives end-to-end (emit → run in Claude Code → diff the approval screen).
 *
 * Topology (a flat ordered phase list, per the V1 editor):
 *   1. step    — reviewer      (Opus)   review the diff, one finding per item
 *   2. fan-out — investigator  (Sonnet) one per finding, dynamic-N, cap 8
 *   3. step    — synthesizer   (Haiku)  merge into one ranked summary
 *
 * Used by tests now; the UI will load it as the default workspace later.
 */
import type { WorkflowSpec } from './schema'

export const codeReviewLoop: WorkflowSpec = {
  name: 'code-review-loop',
  caps: { concurrency: 8, total: 1000 },
  agents: [
    {
      id: 'reviewer',
      name: 'reviewer',
      model: 'claude-opus-4-8',
      prompt:
        'Review the diff on the current branch for correctness bugs and security issues. ' +
        'Group findings by severity and output one finding per item.',
    },
    {
      id: 'investigator',
      name: 'investigator',
      model: 'claude-sonnet-4-6',
      prompt:
        'Given a single finding, reproduce it, trace the root cause, and propose the minimal fix.',
    },
    {
      id: 'synthesizer',
      name: 'synthesizer',
      model: 'claude-haiku-4-5',
      prompt:
        'Merge all investigation reports into one ranked review summary with clear next actions.',
    },
  ],
  root: {
    type: 'sequence',
    steps: [
      { type: 'agent', agent: 'reviewer' },
      { type: 'fanout', agent: 'investigator', cap: 8 },
      { type: 'agent', agent: 'synthesizer' },
    ],
  },
}
