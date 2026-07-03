import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '@/App'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { estimateRunSize } from '@/lib/estimate'

// The receipt column defaults to the Script projection; its <pre> is one big text node.
const script = () => screen.getByText(/export const meta/)

const writeText = vi.fn().mockResolvedValue(undefined)

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
  writeText.mockClear()
  Object.assign(navigator, { clipboard: { writeText } })
})

describe('Studio worksheet — store-bound behavior', () => {
  it('renders the seed: masthead, three numbered phases, agents, models, caps', () => {
    render(<App />)
    expect(screen.getByDisplayValue('code-review-loop')).toBeInTheDocument()

    // kind labels in the pnum gutter
    expect(screen.getAllByText('step')).toHaveLength(2)
    expect(screen.getByText('fan-out')).toBeInTheDocument()

    // agent-name tokens
    expect(screen.getByDisplayValue('reviewer')).toBeInTheDocument()
    expect(screen.getByDisplayValue('investigator')).toBeInTheDocument()
    expect(screen.getByDisplayValue('synthesizer')).toBeInTheDocument()

    // model pills (short ids)
    expect(screen.getByText('opus-4-8')).toBeInTheDocument()
    expect(screen.getByText('sonnet-4-6')).toBeInTheDocument()
    expect(screen.getByText('haiku-4-5')).toBeInTheDocument()

    // caps lede
    expect((screen.getByLabelText('concurrency cap') as HTMLInputElement).value).toBe('8')
    expect((screen.getByLabelText('total cap') as HTMLInputElement).value).toBe('1000')
  })

  it('clamps a concurrency edit to the cap', () => {
    render(<App />)
    const conc = screen.getByLabelText('concurrency cap') as HTMLInputElement
    fireEvent.change(conc, { target: { value: '99' } })
    expect(conc.value).toBe('16')
  })

  it('renaming an agent token flows live into the Script tab', () => {
    render(<App />)
    fireEvent.change(screen.getAllByLabelText('Agent name')[0], { target: { value: 'auditor' } })
    expect(script().textContent).toContain('label: "auditor"')
  })

  it('the Prompt tab shows the prompt artifact and Copy copies it', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
    expect(screen.getByText(/# Workflow: code-review-loop/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy emit' }))
    await waitFor(() => expect(screen.getByText('✓ Copied')).toBeInTheDocument())
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('# Workflow: code-review-loop'),
    )
  })

  it('reads chips render, remove drops the splice, and the picker adds it back', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: '[reviewer] ×' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '[investigator] ×' })).toBeInTheDocument()
    expect(script().textContent).toContain('[reviewer]')

    // remove the fan-out's read of the reviewer memory
    fireEvent.click(screen.getByRole('button', { name: '[reviewer] ×' }))
    expect(script().textContent).not.toContain('[reviewer]')
    expect(screen.queryByRole('button', { name: '[reviewer] ×' })).not.toBeInTheDocument()

    // add it back via the fan-out phase's now-visible picker (first "Add read" in order)
    fireEvent.change(screen.getAllByLabelText('Add read')[0], { target: { value: 'n-review' } })
    expect(script().textContent).toContain('[reviewer]')
  })

  it('enforced marks track model pins; the schema-forced note shows; the cap is enforced', () => {
    render(<App />)
    // opus + (sonnet & cap) + haiku = 4 enforced marks
    expect(screen.getAllByText('enforced')).toHaveLength(4)
    expect(screen.getByText(/schema-forced to/)).toBeInTheDocument()

    // dropping the reviewer's model pin to inherit removes its enforced mark
    act(() => {
      useWorkflowStore.getState().updateAgent('reviewer', { model: 'inherit' })
    })
    expect(screen.getAllByText('enforced')).toHaveLength(3)
  })

  it('removing a phase leaves a dangling read and flips the status pill', () => {
    render(<App />)
    expect(screen.getByText('valid · est ≤ 10 agents')).toBeInTheDocument()
    fireEvent.click(screen.getAllByTitle('Remove phase')[0]) // remove the reviewer step
    expect(screen.getByText('1 issue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '[n-review?] ×' })).toBeInTheDocument()
  })

  it('the status pill reports the run-size estimate', () => {
    render(<App />)
    expect(estimateRunSize(useWorkflowStore.getState().spec)).toBe(10)
    expect(screen.getByText('valid · est ≤ 10 agents')).toBeInTheDocument()
  })

  it('editing a prompt textarea flows into the emitted script', () => {
    render(<App />)
    fireEvent.change(screen.getAllByLabelText('prompt')[0], {
      target: { value: 'AUDIT THE DIFF THOROUGHLY' },
    })
    expect(script().textContent).toContain('AUDIT THE DIFF THOROUGHLY')
  })
})
