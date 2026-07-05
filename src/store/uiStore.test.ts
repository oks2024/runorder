import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './uiStore'

const store = useUiStore
const state = () => store.getState()

const initial = state()

beforeEach(() => {
  store.setState(initial, true)
})

describe('uiStore — defaults', () => {
  it('starts on the rundown view with the script prompt-book open', () => {
    expect(state().view).toBe('rundown')
    expect(state().showScript).toBe(true)
    expect(state().promptBookTab).toBe('script')
    expect(state().draggingPattern).toBeNull()
    expect(state().provHover).toBeNull()
    expect(state().sampleN).toBe(12)
  })
})

describe('uiStore — setters', () => {
  it('switches the view', () => {
    state().setView('rehearsal')
    expect(state().view).toBe('rehearsal')
  })

  it('toggles the prompt-book column', () => {
    state().setShowScript(false)
    expect(state().showScript).toBe(false)
  })

  it('switches the prompt-book tab', () => {
    state().setPromptBookTab('prompt')
    expect(state().promptBookTab).toBe('prompt')
  })

  it('tracks the dragging pattern', () => {
    state().setDragging('fanout')
    expect(state().draggingPattern).toBe('fanout')
    state().setDragging(null)
    expect(state().draggingPattern).toBeNull()
  })

  it('tracks the provenance hover key', () => {
    state().setProvHover('node-1:model')
    expect(state().provHover).toBe('node-1:model')
    state().setProvHover(null)
    expect(state().provHover).toBeNull()
  })
})

describe('uiStore — sampleN clamping', () => {
  it('accepts an in-range value', () => {
    state().setSampleN(30)
    expect(state().sampleN).toBe(30)
  })

  it('clamps below the minimum', () => {
    state().setSampleN(0)
    expect(state().sampleN).toBe(1)
    state().setSampleN(-5)
    expect(state().sampleN).toBe(1)
  })

  it('clamps above the maximum', () => {
    state().setSampleN(500)
    expect(state().sampleN).toBe(99)
  })

  it('rounds fractional values', () => {
    state().setSampleN(12.6)
    expect(state().sampleN).toBe(13)
  })
})
