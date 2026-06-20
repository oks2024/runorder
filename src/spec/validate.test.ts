import { describe, it, expect } from 'vitest'
import { validateSpec } from './validate'
import { codeReviewLoop } from './seed'
import type { WorkflowSpec } from './schema'

describe('validateSpec', () => {
  it('passes the seed spec (every ref resolves)', () => {
    expect(validateSpec(codeReviewLoop)).toEqual({ ok: true })
  })

  it('flags a dangling fanout ref (parses through Zod, fails the graph pass)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'reviewer' },
          { type: 'fanout', agent: 'ghost', cap: 8 },
        ],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]).toMatchObject({ code: 'dangling-ref', ref: 'ghost' })
    }
  })

  it('reports each dangling ref once', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'fanout', agent: 'ghost', cap: 2 },
          { type: 'agent', agent: 'ghost' },
        ],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toHaveLength(1)
  })
})
