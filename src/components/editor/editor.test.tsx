import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '@/App'
import { useWorkflowStore } from '@/store/workflowStore'

// The Emit pane defaults to the Script projection.
const script = () => screen.getByText(/export const meta/)
const prompt = () => screen.getByText(/Run the following as a dynamic workflow/)

beforeEach(() => {
  useWorkflowStore.getState().load() // fresh seed before each render
})

describe('Editor UI — store-bound behavior', () => {
  it('renders the seed: roster, phases, and the live script artifact', () => {
    render(<App />)
    expect(screen.getByText('3 defined')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Agent name')).toHaveLength(3)
    expect(script().textContent).toContain('name: "code-review-loop"')
    expect(script().textContent).toContain('fan-out — investigator → claude-sonnet-4-6 (dynamic-N, cap 8)')
  })

  it('switches to the Prompt (fallback) projection on tab click', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: /Prompt/ }))
    expect(prompt().textContent).toContain('# Workflow: code-review-loop')
  })

  it('add-agent grows the roster', () => {
    render(<App />)
    fireEvent.click(screen.getByText('+ add agent'))
    expect(screen.getByText('4 defined')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Agent name')).toHaveLength(4)
  })

  it('clamps a concurrency edit to the cap', () => {
    render(<App />)
    const conc = screen.getByLabelText('Concurrency cap') as HTMLInputElement
    fireEvent.change(conc, { target: { value: '99' } })
    expect(conc.value).toBe('16')
  })

  it('renaming an agent flows live into the emitted artifact', () => {
    render(<App />)
    fireEvent.change(screen.getAllByLabelText('Agent name')[0], { target: { value: 'auditor' } })
    expect(script().textContent).toContain('step — auditor → claude-opus-4-8')
    expect(script().textContent).toContain('label: "auditor"')
  })

  it('+ Fan-out appends a phase reflected in the artifact', () => {
    render(<App />)
    fireEvent.click(screen.getByText('+ Fan-out'))
    expect(script().textContent).toContain('{ title: "Phase 4"')
  })

  it('+ Loop appends a loop phase reflected in the emitted script', () => {
    render(<App />)
    fireEvent.click(screen.getByText('+ Loop'))
    expect(screen.getByText('↻ Loop')).toBeInTheDocument() // rendered in the composition pane
    expect(script().textContent).toContain('for (let i = 0;') // emitted as a bounded loop
    expect(script().textContent).toContain('loop — reviewer → claude-opus-4-8 (until done, ≤ 3)')
  })

  it('deleting a referenced agent flips the validation pill to an issue', () => {
    render(<App />)
    expect(screen.getByText('Valid · 0 issues')).toBeInTheDocument()
    // remove "investigator" (the fan-out target) — its remove is the 2nd in the roster
    fireEvent.click(screen.getAllByTitle('Remove agent')[1])
    expect(screen.getByText('1 issue')).toBeInTheDocument()
  })

  it('Copy reports success', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(screen.getByText('✓ Copied')).toBeInTheDocument())
  })
})
