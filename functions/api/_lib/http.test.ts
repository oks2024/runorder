// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { json, errorJson } from './http'

describe('http — json', () => {
  it('serializes the body and sets no-store JSON headers', async () => {
    const res = json({ hello: 'world' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ hello: 'world' })
  })

  it('honors a custom status and merges extra headers over the defaults', () => {
    const res = json({ ok: true }, 201, { 'x-trace': 'abc' })
    expect(res.status).toBe(201)
    expect(res.headers.get('x-trace')).toBe('abc')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('http — errorJson', () => {
  it('wraps the message in an { error } envelope at the given status', async () => {
    const res = errorJson('nope', 400)
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'nope' })
  })
})
