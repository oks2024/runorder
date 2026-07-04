import { describe, it, expect } from 'vitest'
import { serializeSpec, parseImport, specFilename, FILE_VERSION } from './persist'
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
    const bad = { prewire: 1, spec: { name: '', caps: {}, agents: [], root: {} } }
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

describe('persist — specFilename', () => {
  it('kebab-slugs the workflow name and appends .json', () => {
    expect(specFilename({ ...codeReviewLoop, name: 'My Cool Flow!' })).toBe('my-cool-flow.json')
  })

  it('falls back to workflow.json when the name has no slug characters', () => {
    expect(specFilename({ ...codeReviewLoop, name: '!!!' })).toBe('workflow.json')
  })
})
