import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import App from '@/App'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { estimateRunSize } from '@/lib/estimate'
import { PATTERN_INFO, PATTERN_NAME, PATTERN_ORDER, PATTERN_DND_MIME } from '@/lib/patterns'

/** A minimal stubbed `DataTransfer` for jsdom, which has no native drag-and-drop. */
function stubDataTransfer(kind?: string) {
  const store = new Map<string, string>()
  if (kind) store.set(PATTERN_DND_MIME, kind)
  return {
    setData: (t: string, v: string) => store.set(t, v),
    getData: (t: string) => store.get(t) ?? '',
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
  }
}

// The prompt-book column defaults to the Script projection, now rendered as one row per emitted
// line (M4 provenance) rather than one big `<pre>` text node — `.textContent` still
// aggregates every row's text, so substring assertions below are unaffected.
const script = () => screen.getByTestId('script-body')

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  useWorkflowStore.getState().load() // fresh seed
  useUiStore.setState({
    view: 'rundown',
    showScript: true,
    promptBookTab: 'script',
    mobilePane: 'rundown',
    draggingPattern: null,
    insertAt: null,
    provHover: null,
  })
  writeText.mockClear()
  Object.assign(navigator, { clipboard: { writeText } })
})

describe('Studio rundown — store-bound behavior', () => {
  it('renders the seed: masthead, three numbered phases, agents, models, caps', () => {
    render(<App />)
    expect(screen.getByDisplayValue('code-review-loop')).toBeInTheDocument()

    // kind labels in the pnum gutter (scoped to the rundown — the shelf also has cards
    // named "step"/"fan-out")
    const main = within(screen.getByRole('main'))
    expect(main.getAllByText('step')).toHaveLength(2)
    expect(main.getByText('fan-out')).toBeInTheDocument()

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

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))
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

describe('Studio pattern shelf — drag-to-insert', () => {
  it('renders all ten pattern cards with names, use-lines and in→out signatures', () => {
    render(<App />)
    const shelf = screen.getByLabelText('Pattern repertoire')
    for (const kind of PATTERN_ORDER) {
      expect(within(shelf).getByText(PATTERN_NAME[kind])).toBeInTheDocument()
      expect(within(shelf).getByText(PATTERN_INFO[kind].use)).toBeInTheDocument()
      // io signatures repeat across cards (several patterns are 1→1) — presence, not uniqueness
      expect(within(shelf).getAllByText(PATTERN_INFO[kind].io).length).toBeGreaterThan(0)
    }
  })

  it('shows the glyph-grammar legend above the cards', () => {
    render(<App />)
    const shelf = screen.getByLabelText('Pattern repertoire')
    expect(within(shelf).getByText('agent run')).toBeInTheDocument()
    expect(within(shelf).getByText(/item handed between phases/)).toBeInTheDocument()
  })

  it('a branches phase renders one token per branch and can add/remove branches', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^branches/i }))

    // two fresh branch agents, one prompt block each
    expect(screen.getByDisplayValue('branch')).toBeInTheDocument()
    expect(screen.getByDisplayValue('branch-2')).toBeInTheDocument()
    expect(screen.getByLabelText('prompt — branch 1')).toBeInTheDocument()
    expect(screen.getByLabelText('prompt — branch 2')).toBeInTheDocument()

    // the gutter's in→out signature shows the real branch count and tracks it
    expect(screen.getByText('1→2')).toBeInTheDocument()

    // grow to three — the remove affordance appears only above the two-branch floor
    fireEvent.click(screen.getByRole('button', { name: '+ branch' }))
    expect(screen.getByDisplayValue('branch-3')).toBeInTheDocument()
    expect(screen.getByText('1→3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove branch 3' }))
    expect(screen.queryByDisplayValue('branch-3')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove branch/ })).not.toBeInTheDocument()

    const root = useWorkflowStore.getState().spec.root
    expect(root.type).toBe('sequence')
    if (root.type === 'sequence') {
      const node = root.steps[root.steps.length - 1]
      expect(node.type === 'branches' && node.branches).toHaveLength(2)
    }
  })

  it('clicking a pattern card appends a fresh phase (keyboard/touch fallback)', () => {
    render(<App />)
    expect(useWorkflowStore.getState().spec.agents).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: /^fan-out/i }))

    const root = useWorkflowStore.getState().spec.root
    expect(root.type).toBe('sequence')
    if (root.type === 'sequence') {
      expect(root.steps).toHaveLength(4)
      expect(root.steps[3].type).toBe('fanout')
    }
    // fresh agent minted for the fan-out's role, named after ROLE_NAMES.fanout = ['worker']
    expect(screen.getByDisplayValue('worker')).toBeInTheDocument()
  })

  it('dragging a card from the shelf lights every seam and drop-end; dragend clears them', () => {
    render(<App />)
    const card = screen.getByRole('button', { name: /^step/i })
    const dataTransfer = stubDataTransfer()

    fireEvent.dragStart(card, { dataTransfer })
    expect(useUiStore.getState().draggingPattern).toBe('step')
    expect(screen.getByTestId('seam-0')).toHaveAttribute('data-hot', 'true')
    expect(screen.getByTestId('seam-1')).toHaveAttribute('data-hot', 'true')
    expect(screen.getByTestId('drop-end')).toHaveAttribute('data-hot', 'true')

    fireEvent.dragEnd(card, { dataTransfer })
    expect(useUiStore.getState().draggingPattern).toBeNull()
    expect(screen.getByTestId('seam-0')).toHaveAttribute('data-hot', 'false')
    expect(screen.getByTestId('drop-end')).toHaveAttribute('data-hot', 'false')
  })

  it('dropping on the seam at index 1 inserts there (position 2 of 4)', () => {
    render(<App />)
    const card = screen.getByRole('button', { name: /^loop/i })
    const dataTransfer = stubDataTransfer()

    fireEvent.dragStart(card, { dataTransfer })
    const seam1 = screen.getByTestId('seam-1')
    fireEvent.dragOver(seam1, { dataTransfer })
    fireEvent.drop(seam1, { dataTransfer })

    const root = useWorkflowStore.getState().spec.root
    expect(root.type).toBe('sequence')
    if (root.type === 'sequence') {
      expect(root.steps).toHaveLength(4)
      expect(root.steps[1].type).toBe('iterateUntil')
    }
    // scoped to the rundown — the shelf also has a card named "loop"
    expect(within(screen.getByRole('main')).getAllByText('loop')).toHaveLength(1)
    expect(useUiStore.getState().draggingPattern).toBeNull()
  })

  it('a duplicate drop event on the same seam only inserts once', () => {
    render(<App />)
    const card = screen.getByRole('button', { name: /^step/i })
    const dataTransfer = stubDataTransfer()

    fireEvent.dragStart(card, { dataTransfer })
    const seam1 = screen.getByTestId('seam-1')
    fireEvent.drop(seam1, { dataTransfer })
    fireEvent.drop(seam1, { dataTransfer }) // duplicate — must be a no-op

    const root = useWorkflowStore.getState().spec.root
    expect(root.type).toBe('sequence')
    if (root.type === 'sequence') expect(root.steps).toHaveLength(4)
  })

  it('dropping on the drop-end appends at the end', () => {
    render(<App />)
    const card = screen.getByRole('button', { name: /^multi-angle/i })
    const dataTransfer = stubDataTransfer()

    fireEvent.dragStart(card, { dataTransfer })
    const dropEnd = screen.getByTestId('drop-end')
    fireEvent.dragOver(dropEnd, { dataTransfer })
    fireEvent.drop(dropEnd, { dataTransfer })

    const root = useWorkflowStore.getState().spec.root
    expect(root.type).toBe('sequence')
    if (root.type === 'sequence') {
      expect(root.steps).toHaveLength(4)
      expect(root.steps[3].type).toBe('multiAngle')
    }
  })
})

describe('Studio repertoire sheet — tap/click-to-insert (the touch path)', () => {
  it('clicking a seam opens the sheet; picking a pattern inserts at exactly that index', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Insert a pattern as phase 2' }))
    expect(useUiStore.getState().insertAt).toBe(1)

    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('button', { name: `Insert ${PATTERN_NAME.loop}` }))

    const root = useWorkflowStore.getState().spec.root
    expect(root.type).toBe('sequence')
    if (root.type === 'sequence') {
      expect(root.steps).toHaveLength(4)
      expect(root.steps[1].type).toBe('iterateUntil')
    }
    // one pick closes the sheet and disarms the insertion index
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useUiStore.getState().insertAt).toBeNull()
  })

  it('clicking the end slot opens the sheet appending after the last phase', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('drop-end'))
    expect(useUiStore.getState().insertAt).toBe(3)

    const sheet = screen.getByRole('dialog')
    fireEvent.click(
      within(sheet).getByRole('button', { name: `Insert ${PATTERN_NAME.multiAngle}` }),
    )

    const root = useWorkflowStore.getState().spec.root
    expect(root.type).toBe('sequence')
    if (root.type === 'sequence') {
      expect(root.steps).toHaveLength(4)
      expect(root.steps[3].type).toBe('multiAngle')
    }
  })

  it('the sheet lists every pattern and closing it inserts nothing', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Insert a pattern as phase 1' }))

    const sheet = screen.getByRole('dialog')
    for (const kind of PATTERN_ORDER) {
      expect(
        within(sheet).getByRole('button', { name: `Insert ${PATTERN_NAME[kind]}` }),
      ).toBeInTheDocument()
    }

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const root = useWorkflowStore.getState().spec.root
    if (root.type === 'sequence') expect(root.steps).toHaveLength(3)
  })
})

describe('Studio mobile mode bar', () => {
  it('switches between rundown, script and rehearsal modes', () => {
    render(<App />)
    const bar = screen.getByRole('navigation', { name: 'View' })

    fireEvent.click(within(bar).getByRole('button', { name: 'Script' }))
    expect(useUiStore.getState().view).toBe('rundown')
    expect(useUiStore.getState().mobilePane).toBe('script')

    fireEvent.click(within(bar).getByRole('button', { name: 'Rehearse' }))
    expect(useUiStore.getState().view).toBe('rehearsal')

    fireEvent.click(within(bar).getByRole('button', { name: 'Rundown' }))
    expect(useUiStore.getState().view).toBe('rundown')
    expect(useUiStore.getState().mobilePane).toBe('rundown')
  })
})

describe('Studio agent token — retarget dropdown', () => {
  it('retargeting a role via the ▾ picker reassigns it and GCs the orphaned agent', () => {
    render(<App />)
    expect(useWorkflowStore.getState().spec.agents).toHaveLength(3)
    expect(screen.getByDisplayValue('synthesizer')).toBeInTheDocument()

    const picker = screen.getByLabelText('Retarget synthesizer to another agent')
    fireEvent.change(picker, { target: { value: 'reviewer' } })

    // phase 3's sentence now shows "reviewer" (shared with phase 1's token)
    expect(screen.getAllByDisplayValue('reviewer')).toHaveLength(2)
    expect(screen.queryByDisplayValue('synthesizer')).not.toBeInTheDocument()

    // the orphaned "synthesizer" agent is unreferenced anywhere now — GC'd from the roster
    expect(useWorkflowStore.getState().spec.agents).toHaveLength(2)
  })
})
