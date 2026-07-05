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
