import { describe, it, expect } from 'vitest'
import {
  serializeSpec,
  parseImport,
  specFilename,
  specsEqual,
  FILE_VERSION,
} from './persist'
import { codeReviewLoop } from '@/spec/seed'
import type { WorkflowSpec } from '@/spec/schema'

describe('persist — serializeSpec', () => {
  it('wraps the spec in a versioned envelope with the name inside the spec', () => {
    const parsed = JSON.parse(serializeSpec(codeReviewLoop))
    expect(parsed.prewire).toBe(FILE_VERSION)
    expect(parsed.spec.name).toBe('code-review-loop')
  })

  it('round-trips through parseImport byte-for-byte on the spec', () => {
    const result = parseImport(serializeSpec(codeReviewLoop))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec).toEqual(codeReviewLoop)
  })
})

describe('persist — parseImport', () => {
  it('accepts a bare spec (no envelope) for forward-friendliness', () => {
    const result = parseImport(JSON.stringify(codeReviewLoop))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec.name).toBe('code-review-loop')
  })

  it('rejects non-JSON with a clear message', () => {
    const result = parseImport('{ not json')
    expect(result).toEqual({ ok: false, error: 'Not valid JSON.' })
  })

  it('rejects a shape-invalid spec (fails Zod)', () => {
    const bad = {
      prewire: 1,
      spec: { name: '', caps: {}, agents: [], root: {} },
    }
    const result = parseImport(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Not a valid workflow/)
  })

  it('rejects a graph-invalid spec (passes Zod, fails validateSpec on a dangling ref)', () => {
    const dangling: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [{ type: 'agent', agent: 'ghost', id: 'n-1' }],
      },
    }
    const result = parseImport(serializeSpec(dangling))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Invalid workflow/)
  })
})

describe('persist — specsEqual', () => {
  it('is true across key order and a localStorage round-trip', () => {
    const reordered = {
      root: codeReviewLoop.root,
      agents: codeReviewLoop.agents,
      caps: codeReviewLoop.caps,
      name: codeReviewLoop.name,
    } as WorkflowSpec
    expect(specsEqual(codeReviewLoop, reordered)).toBe(true)
    expect(
      specsEqual(codeReviewLoop, JSON.parse(JSON.stringify(codeReviewLoop))),
    ).toBe(true)
  })

  it('treats an explicitly-undefined key as absent', () => {
    const withUndef: WorkflowSpec = JSON.parse(JSON.stringify(codeReviewLoop))
    if (withUndef.root.type === 'sequence') {
      Object.assign(withUndef.root.steps[0], { reads: undefined })
    }
    expect(specsEqual(codeReviewLoop, withUndef)).toBe(true)
  })

  it('is false when a nested field differs or array order changes', () => {
    expect(
      specsEqual(codeReviewLoop, {
        ...codeReviewLoop,
        caps: { concurrency: 4, total: 100 },
      }),
    ).toBe(false)
    expect(
      specsEqual(codeReviewLoop, {
        ...codeReviewLoop,
        agents: [...codeReviewLoop.agents].reverse(),
      }),
    ).toBe(false)
  })
})

describe('persist — specFilename', () => {
  it('kebab-slugs the workflow name and appends .json', () => {
    expect(specFilename({ ...codeReviewLoop, name: 'My Cool Flow!' })).toBe(
      'my-cool-flow.json',
    )
  })

  it('falls back to workflow.json when the name has no slug characters', () => {
    expect(specFilename({ ...codeReviewLoop, name: '!!!' })).toBe(
      'workflow.json',
    )
  })
})
