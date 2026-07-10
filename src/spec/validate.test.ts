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

  it('flags a dangling ref inside a branches node', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [{ type: 'branches', branches: ['reviewer', 'ghost-branch'] }],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]).toMatchObject({ code: 'dangling-ref', ref: 'ghost-branch' })
    }
  })

  it('flags dangling refs inside refine and verify nodes', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'refine', producer: 'reviewer', critic: 'ghost-judge', maxIter: 3 },
          { type: 'verify', skeptic: 'ghost-skeptic', votes: 3, cap: 4 },
        ],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((i) => i.ref).sort()).toEqual(['ghost-judge', 'ghost-skeptic'])
      expect(result.issues.every((i) => i.code === 'dangling-ref')).toBe(true)
    }
  })

  it('flags a self-grant delegation cycle', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [{ type: 'agent', agent: 'reviewer', grants: [{ agent: 'reviewer', cap: 2 }] }],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatchObject({ code: 'delegation-cycle', ref: 'reviewer' })
  })

  it('flags a two-node delegation cycle (A delegates to B, B delegates to A)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'reviewer', grants: [{ agent: 'investigator', cap: 2 }] },
          { type: 'agent', agent: 'investigator', grants: [{ agent: 'reviewer', cap: 2 }] },
        ],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((i) => i.code === 'delegation-cycle')).toBe(true)
  })

  it('accepts an acyclic delegation (A delegates to B, no back-edge)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [{ type: 'agent', agent: 'reviewer', grants: [{ agent: 'investigator', cap: 2 }] }],
      },
    }
    expect(validateSpec(spec)).toEqual({ ok: true })
  })

  it('flags a read that resolves to nothing', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'reviewer', id: 'n1' },
          { type: 'agent', agent: 'synthesizer', id: 'n2', reads: ['nope'] },
        ],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatchObject({ code: 'dangling-read', ref: 'nope' })
  })

  it('flags a forward read (a memory only exists once its phase has run)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'reviewer', id: 'n1', reads: ['n2'] },
          { type: 'agent', agent: 'synthesizer', id: 'n2' },
        ],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatchObject({ code: 'dangling-read', ref: 'n2' })
  })

  it('flags a self-read', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [{ type: 'agent', agent: 'reviewer', id: 'n1', reads: ['n1'] }],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatchObject({ code: 'dangling-read', ref: 'n1' })
  })

  it('flags duplicate node ids once', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'reviewer', id: 'dup' },
          { type: 'agent', agent: 'investigator', id: 'dup' },
          { type: 'agent', agent: 'synthesizer', id: 'dup' },
        ],
      },
    }
    const result = validateSpec(spec)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const dupes = result.issues.filter((i) => i.code === 'duplicate-node-id')
      expect(dupes).toHaveLength(1)
      expect(dupes[0].ref).toBe('dup')
    }
  })

  it('accepts valid backward reads (the seed reads chain)', () => {
    // codeReviewLoop already wires reads; `ok: true` in the first test covers it. This
    // covers a multi-target read reaching further back than the previous phase.
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'reviewer', id: 'n1' },
          { type: 'agent', agent: 'investigator', id: 'n2', reads: ['n1'] },
          { type: 'agent', agent: 'synthesizer', id: 'n3', reads: ['n1', 'n2'] },
        ],
      },
    }
    expect(validateSpec(spec)).toEqual({ ok: true })
  })

  it('flags a blank launch-input label (shape-valid, graph-invalid)', () => {
    const blank = validateSpec({ ...codeReviewLoop, input: { label: '' } })
    expect(blank.ok).toBe(false)
    if (!blank.ok) {
      const issues = blank.issues.filter((i) => i.code === 'blank-input-label')
      expect(issues).toHaveLength(1)
    }
    // whitespace-only counts as blank too
    expect(validateSpec({ ...codeReviewLoop, input: { label: '   ' } }).ok).toBe(false)
    // a named input (the seed) and no input at all are both fine
    expect(validateSpec(codeReviewLoop)).toEqual({ ok: true })
    expect(validateSpec({ ...codeReviewLoop, input: undefined })).toEqual({ ok: true })
  })
})
