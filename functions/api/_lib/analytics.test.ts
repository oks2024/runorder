// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  cleanEvent,
  sanitizeProps,
  dayStamp,
  visitorHash,
} from './analytics'

describe('analytics — cleanEvent', () => {
  it('accepts a well-formed event and normalizes path/props', () => {
    const out = cleanEvent({ name: 'pattern_insert', path: '/', props: { kind: 'loop' } })
    expect(out).toEqual({
      ok: true,
      event: { name: 'pattern_insert', path: '/', props: '{"kind":"loop"}' },
    })
  })

  it('defaults missing path and props to null', () => {
    const out = cleanEvent({ name: 'pageview' })
    expect(out).toEqual({ ok: true, event: { name: 'pageview', path: null, props: null } })
  })

  it('rejects a malformed body', () => {
    expect(cleanEvent({}).ok).toBe(false)
    expect(cleanEvent({ name: 42 }).ok).toBe(false)
    expect(cleanEvent(null).ok).toBe(false)
  })

  it('rejects a name that is not lowercase snake_case', () => {
    expect(cleanEvent({ name: 'PageView' }).ok).toBe(false)
    expect(cleanEvent({ name: '1bad' }).ok).toBe(false)
    expect(cleanEvent({ name: 'has-dash' }).ok).toBe(false)
    expect(cleanEvent({ name: 'x'.repeat(41) }).ok).toBe(false)
  })
})

describe('analytics — sanitizeProps', () => {
  it('returns null for missing or empty props', () => {
    expect(sanitizeProps(undefined)).toBeNull()
    expect(sanitizeProps({})).toBeNull()
  })

  it('keeps only string/number/boolean values', () => {
    const json = sanitizeProps({ a: 'x', b: 3, c: true })
    expect(JSON.parse(json!)).toEqual({ a: 'x', b: 3, c: true })
  })

  it('drops non-finite numbers', () => {
    expect(sanitizeProps({ n: Number.POSITIVE_INFINITY, m: NaN })).toBeNull()
  })

  it('caps the number of kept keys at 12', () => {
    const many = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`k${i}`, i]),
    )
    const parsed = JSON.parse(sanitizeProps(many)!)
    expect(Object.keys(parsed)).toHaveLength(12)
  })

  it('truncates long string values to 200 chars', () => {
    const parsed = JSON.parse(sanitizeProps({ big: 'z'.repeat(500) })!)
    expect(parsed.big).toHaveLength(200)
  })
})

describe('analytics — dayStamp', () => {
  it('renders the UTC day of an epoch-ms instant', () => {
    expect(dayStamp(Date.parse('2026-07-07T23:59:00Z'))).toBe('2026-07-07')
    expect(dayStamp(Date.parse('2026-07-08T00:01:00Z'))).toBe('2026-07-08')
  })
})

describe('analytics — visitorHash', () => {
  it('is deterministic for the same inputs and 16 hex chars', async () => {
    const a = await visitorHash('1.2.3.4', 'UA', '2026-07-07', 'secret')
    const b = await visitorHash('1.2.3.4', 'UA', '2026-07-07', 'secret')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('rotates across days (unlinkable day-to-day)', async () => {
    const d1 = await visitorHash('1.2.3.4', 'UA', '2026-07-07', 'secret')
    const d2 = await visitorHash('1.2.3.4', 'UA', '2026-07-08', 'secret')
    expect(d1).not.toBe(d2)
  })

  it('differs for a different IP and cannot be recomputed without the secret', async () => {
    const base = await visitorHash('1.2.3.4', 'UA', '2026-07-07', 'secret')
    expect(await visitorHash('5.6.7.8', 'UA', '2026-07-07', 'secret')).not.toBe(base)
    expect(await visitorHash('1.2.3.4', 'UA', '2026-07-07', 'other')).not.toBe(base)
  })
})
