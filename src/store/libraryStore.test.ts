import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from './libraryStore'
import { useWorkflowStore } from './workflowStore'
import { blankSpec, codeReviewLoop } from '@/spec/seed'
import type { WorkflowSpec } from '@/spec/schema'

const lib = useLibraryStore
const wf = useWorkflowStore

beforeEach(() => {
  lib.setState({ entries: {} })
  wf.getState().load() // fresh seed
})

describe('libraryStore — save', () => {
  it('upserts under spec.name and deep-clones (no shared reference)', () => {
    lib.getState().save(codeReviewLoop)
    const entry = lib.getState().entries['code-review-loop']
    expect(entry).toBeTruthy()
    expect(entry.spec).toEqual(codeReviewLoop)
    expect(entry.spec).not.toBe(codeReviewLoop)
    expect(entry.savedAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('overwrites the same name in place (upsert, not append)', () => {
    lib.getState().save(codeReviewLoop)
    lib
      .getState()
      .save({ ...codeReviewLoop, caps: { concurrency: 4, total: 100 } })
    expect(lib.getState().names()).toEqual(['code-review-loop'])
    expect(
      lib.getState().entries['code-review-loop'].spec.caps.concurrency,
    ).toBe(4)
  })

  it('keeps distinct names separately, sorted', () => {
    lib.getState().save({ ...codeReviewLoop, name: 'zeta' })
    lib.getState().save({ ...codeReviewLoop, name: 'alpha' })
    expect(lib.getState().names()).toEqual(['alpha', 'zeta'])
    expect(lib.getState().has('alpha')).toBe(true)
    expect(lib.getState().has('missing')).toBe(false)
  })
})

describe('libraryStore — open', () => {
  it('loads a saved entry into the live worksheet via workflowStore.load', () => {
    const other: WorkflowSpec = { ...codeReviewLoop, name: 'other-flow' }
    lib.getState().save(other)
    expect(wf.getState().spec.name).toBe('code-review-loop')
    lib.getState().open('other-flow')
    expect(wf.getState().spec.name).toBe('other-flow')
    // load deep-clones: mutating the live spec must not touch the saved entry.
    wf.getState().setName('mutated')
    expect(lib.getState().entries['other-flow'].spec.name).toBe('other-flow')
  })

  it('is a no-op for an unknown name', () => {
    lib.getState().open('nope')
    expect(wf.getState().spec.name).toBe('code-review-loop')
  })
})

describe('libraryStore — isDirty', () => {
  it('the untouched seed and a fresh blank are clean (never nag a pristine doc)', () => {
    expect(lib.getState().isDirty(wf.getState().spec)).toBe(false)
    expect(lib.getState().isDirty(blankSpec())).toBe(false)
  })

  it('an edited, never-saved doc is dirty', () => {
    wf.getState().setName('my-flow')
    expect(lib.getState().isDirty(wf.getState().spec)).toBe(true)
  })

  it('a doc matching its saved entry is clean; diverging from it is dirty', () => {
    const saved: WorkflowSpec = { ...codeReviewLoop, name: 'my-flow' }
    lib.getState().save(saved)
    expect(lib.getState().isDirty(saved)).toBe(false)
    expect(
      lib
        .getState()
        .isDirty({ ...saved, caps: { concurrency: 4, total: 100 } }),
    ).toBe(true)
  })
})

describe('libraryStore — remove', () => {
  it('deletes the named entry only', () => {
    lib.getState().save({ ...codeReviewLoop, name: 'a' })
    lib.getState().save({ ...codeReviewLoop, name: 'b' })
    lib.getState().remove('a')
    expect(lib.getState().names()).toEqual(['b'])
  })
})
