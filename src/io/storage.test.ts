import { describe, it, expect, beforeEach } from 'vitest'
import { migrateStorageKey } from './storage'

describe('storage — migrateStorageKey', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('moves a value from the old key to the new key', () => {
    localStorage.setItem('prewire.live', '{"spec":1}')
    migrateStorageKey('prewire.live', 'playsheet.live')
    expect(localStorage.getItem('playsheet.live')).toBe('{"spec":1}')
    expect(localStorage.getItem('prewire.live')).toBeNull()
  })

  it('keeps the new key when both exist (old is stale), still clearing the old', () => {
    localStorage.setItem('prewire.live', 'old')
    localStorage.setItem('playsheet.live', 'new')
    migrateStorageKey('prewire.live', 'playsheet.live')
    expect(localStorage.getItem('playsheet.live')).toBe('new')
    expect(localStorage.getItem('prewire.live')).toBeNull()
  })

  it('is a no-op when the old key is absent', () => {
    migrateStorageKey('prewire.live', 'playsheet.live')
    expect(localStorage.getItem('playsheet.live')).toBeNull()
  })
})
