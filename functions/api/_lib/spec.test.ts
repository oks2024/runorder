import { describe, it, expect } from 'vitest'
import { checkIncomingSpec, MAX_SPEC_BYTES } from './spec'
import { codeReviewLoop } from '../../../src/spec/seed'

describe('spec — checkIncomingSpec', () => {
  it('accepts a valid spec object', () => {
    const result = checkIncomingSpec(codeReviewLoop)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec.name).toBe('code-review-loop')
  })

  it('accepts an enveloped spec (unwrapped by the shared pipeline)', () => {
    const result = checkIncomingSpec({ runorder: 1, spec: codeReviewLoop })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec.name).toBe('code-review-loop')
  })

  it('rejects an invalid value with a human-readable error', () => {
    const result = checkIncomingSpec({
      name: '',
      caps: {},
      agents: [],
      root: {},
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Not a valid workflow/)
  })

  it('exposes a 100 KiB size cap', () => {
    expect(MAX_SPEC_BYTES).toBe(102400)
  })
})
