import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from '@/App'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'

beforeEach(() => {
  useWorkflowStore.getState().load() // fresh seed
  useUiStore.setState({
    view: 'worksheet',
    showScript: true,
    receiptTab: 'script',
    draggingPattern: null,
    provHover: null,
    sampleN: 12,
  })
})

function switchToRehearsal() {
  fireEvent.click(screen.getByRole('tab', { name: 'Rehearsal' }))
}

describe('Rehearsal view — banner + wiring', () => {
  it('switching to Rehearsal shows the sampleN=12 seed tally and hides the worksheet', () => {
    render(<App />)
    switchToRehearsal()

    expect(screen.getByText('10 agents')).toBeInTheDocument()
    expect(screen.getByText('1 + 8∥ + 1')).toBeInTheDocument()
    expect(screen.getByText('peak 8/8')).toBeInTheDocument()

    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('code-review-loop')).not.toBeInTheDocument()
  })

  it('the doc label reads Rehearsal (styled uppercase) and the Script toggle is disabled', () => {
    render(<App />)
    switchToRehearsal()

    expect(screen.getByTestId('doc-label')).toHaveTextContent('Rehearsal')
    expect(screen.getByRole('button', { name: 'Script' })).toBeDisabled()
  })
})

describe('Rehearsal view — sampleN stepper', () => {
  it('stepping down to 5 clears the cap warning; stepping back up to 12 restores it', () => {
    render(<App />)
    switchToRehearsal()

    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole('button', { name: 'Fewer' }))
    expect(useUiStore.getState().sampleN).toBe(5)
    expect(screen.getAllByRole('button', { name: /investigator/i })).toHaveLength(5)
    expect(screen.queryByText(/drops \d+ silently/)).not.toBeInTheDocument()

    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(useUiStore.getState().sampleN).toBe(12)
    expect(screen.getByText('drops 4 silently')).toBeInTheDocument()
  })
})

describe('Rehearsal view — cap warning fix button', () => {
  it('raises the fan-out cap, clears the warning, and updates the tally', () => {
    render(<App />)
    switchToRehearsal()

    expect(screen.getByText('drops 4 silently')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'raise cap to 12' }))

    const root = useWorkflowStore.getState().spec.root
    expect(root.type).toBe('sequence')
    if (root.type === 'sequence') {
      const fanout = root.steps[1]
      expect(fanout.type).toBe('fanout')
      if (fanout.type === 'fanout') expect(fanout.cap).toBe(12)
    }

    expect(screen.queryByText(/drops \d+ silently/)).not.toBeInTheDocument()
    expect(screen.getByText('14 agents')).toBeInTheDocument()
  })
})

describe('Rehearsal view — dropped cards', () => {
  it('renders 4 dropped cards at sampleN=12', () => {
    render(<App />)
    switchToRehearsal()
    expect(screen.getAllByText('dropped by cap')).toHaveLength(4)
  })
})

describe('Rehearsal view — anatomy card', () => {
  it('defaults the hero to worker #3 and shows its full assembled input', () => {
    render(<App />)
    switchToRehearsal()

    const anatomy = screen.getByTestId('anatomy-card')
    expect(screen.getByTestId('anatomy-header').textContent).toContain('#3')
    expect(anatomy.textContent).toContain('model claude-sonnet-4-6 · enforced')
    expect(anatomy.textContent).toContain('[reviewer] — read, from reviewer')
    expect(anatomy.textContent).toContain('spliced because this phase reads → reviewer')
    expect(anatomy.textContent).toContain('item 3 of 12')
    expect(anatomy.textContent).toContain('trace the root cause')
    expect(anatomy.textContent).toContain('must return')
  })

  it('clicking another live swarm card re-targets the anatomy header', () => {
    render(<App />)
    switchToRehearsal()

    const workers = screen.getAllByRole('button', { name: /investigator/i })
    fireEvent.click(workers[0]) // worker #1
    expect(screen.getByTestId('anatomy-header').textContent).toContain('#1')
    expect(screen.getByTestId('anatomy-header').textContent).not.toContain('#3')
  })

  it('"edit in worksheet" jumps back to the worksheet view', () => {
    render(<App />)
    switchToRehearsal()

    fireEvent.click(screen.getByRole('button', { name: /edit in worksheet/ }))
    expect(useUiStore.getState().view).toBe('worksheet')
    expect(screen.getByDisplayValue('code-review-loop')).toBeInTheDocument()
  })
})

describe('Rehearsal view — honesty about unpinned models', () => {
  it('shows "session model" with no enforced mark for an inherit-model instance', () => {
    render(<App />)
    const stepCount = useWorkflowStore.getState().spec.root.type === 'sequence'
      ? (useWorkflowStore.getState().spec.root as { steps: unknown[] }).steps.length
      : 0
    useWorkflowStore.getState().insertPattern('step', stepCount) // fresh inherit-model agent named "agent"

    switchToRehearsal()

    const card = screen.getByText('agent').closest('div')
    expect(card).not.toBeNull()
    expect(card!.textContent).toContain('session model')
    expect(card!.textContent).not.toContain('enforced')
  })
})
