// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { newSlug } from './slug'

describe('slug — newSlug', () => {
  it('is always 10 characters long', () => {
    for (let i = 0; i < 100; i++) {
      expect(newSlug()).toHaveLength(10)
    }
  })

  it('uses only the [0-9A-Za-z] alphabet', () => {
    const charset = /^[0-9A-Za-z]{10}$/
    for (let i = 0; i < 100; i++) {
      expect(newSlug()).toMatch(charset)
    }
  })

  it('produces no collisions across 1000 samples', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(newSlug())
    expect(seen.size).toBe(1000)
  })
})
