import { describe, it, expect } from 'vitest'
import { workflowSpecSchema, type WorkflowSpec } from './schema'
import { codeReviewLoop } from './seed'

describe('workflowSpecSchema', () => {
  it('parses the code-review-loop seed spec', () => {
    const parsed = workflowSpecSchema.parse(codeReviewLoop)
    expect(parsed.name).toBe('code-review-loop')
    expect(parsed.agents).toHaveLength(3)
    expect(parsed.root.type).toBe('sequence')
  })

  it('rejects concurrency over the cap (>16)', () => {
    const bad = { ...codeReviewLoop, caps: { concurrency: 17, total: 1000 } }
    expect(workflowSpecSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects total over the cap (>1000)', () => {
    const bad = { ...codeReviewLoop, caps: { concurrency: 8, total: 1001 } }
    expect(workflowSpecSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown pattern node type', () => {
    const bad = { ...codeReviewLoop, root: { type: 'mystery' } }
    expect(workflowSpecSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts a deferred pattern type the editor does not yet expose (adversarial)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: { type: 'adversarial', producer: 'reviewer', critic: 'synthesizer' },
    }
    expect(workflowSpecSchema.safeParse(spec).success).toBe(true)
  })

  it('accepts a nested recursive tree (fanout inside a sequence inside a sequence)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'reviewer' },
          { type: 'sequence', steps: [{ type: 'fanout', agent: 'investigator', cap: 4 }] },
        ],
      },
    }
    expect(workflowSpecSchema.safeParse(spec).success).toBe(true)
  })
})
