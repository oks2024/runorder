import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import App from '@/App'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { tintSegments } from './tintLine'

// The Script tab renders one `.eline` row per emitted line (M4); `data-testid="script-body"`
// is the scrollable container holding all of them.
const script = () => screen.getByTestId('script-body')
const rows = () => Array.from(script().querySelectorAll('.eline')) as HTMLElement[]
const rowContaining = (text: string) => rows().find((r) => r.textContent?.includes(text))

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
})

describe('PromptBook — Script tab line rows', () => {
  it('renders line-numbered rows; ◈ marks only tagged lines (meta name, not phase())', () => {
    render(<App />)
    const all = rows()
    expect(all.length).toBeGreaterThan(10)
    expect(all[0].textContent?.trim().startsWith('1')).toBe(true)

    const nameRow = rowContaining('name:')
    expect(nameRow).toBeTruthy()
    expect(within(nameRow!).getByText('◈')).toBeInTheDocument()

    const phaseHeadRow = all.find((r) => r.textContent?.includes('phase("Phase 1")'))
    expect(phaseHeadRow).toBeTruthy()
    expect(within(phaseHeadRow!).queryByText('◈')).not.toBeInTheDocument()
  })

  it('the Prompt tab has no ◈ gutter', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
    expect(screen.queryByText('◈')).not.toBeInTheDocument()
  })
})

describe('PromptBook — two-way provenance hover', () => {
  it('hovering the phase-2 prompt wrapper lights its script line; mouseLeave clears it', () => {
    render(<App />)
    const wrapper = screen.getAllByLabelText('prompt')[1].closest('[data-prov]') as HTMLElement
    expect(wrapper).toBeTruthy()

    const row = rowContaining('Given a single finding')!
    expect(row).toBeTruthy()
    expect(row.className).not.toContain('lit')

    fireEvent.mouseEnter(wrapper)
    expect(row.className).toContain('lit')

    fireEvent.mouseLeave(wrapper)
    expect(row.className).not.toContain('lit')
  })

  it('reverse: hovering that script line lights the prompt block wrapper', () => {
    render(<App />)
    const wrapper = screen.getAllByLabelText('prompt')[1].closest('[data-prov]') as HTMLElement
    const row = rowContaining('Given a single finding')!

    fireEvent.mouseEnter(row)
    expect(wrapper.className).toContain('lit')

    fireEvent.mouseLeave(row)
    expect(wrapper.className).not.toContain('lit')
  })

  it('hovering the lede caps sentence lights the "// Caps —" comment line', () => {
    render(<App />)
    const wrapper = screen
      .getByLabelText('concurrency cap')
      .closest('[data-prov="caps"]') as HTMLElement
    expect(wrapper).toBeTruthy()

    const row = rowContaining('// Caps —')!
    expect(row).toBeTruthy()

    fireEvent.mouseEnter(wrapper)
    expect(row.className).toContain('lit')

    fireEvent.mouseLeave(wrapper)
    expect(row.className).not.toContain('lit')
  })
})

describe('tintSegments — script-line syntax tint', () => {
  it('tags word-boundary keywords in an otherwise plain line', () => {
    const segs = tintSegments('const x = await agent(P1, opts)')
    expect(segs.filter((s) => s.kind === 'kw').map((s) => s.text)).toEqual(['const', 'await'])
  })

  it('does not treat // inside a string literal as a comment', () => {
    const segs = tintSegments('const s = "http://example.com"')
    expect(segs.some((s) => s.kind === 'cm')).toBe(false)
    expect(segs.find((s) => s.kind === 'str')?.text).toBe('"http://example.com"')
  })

  it('tags a whole-line comment as one cm segment', () => {
    const segs = tintSegments('// this is a note')
    expect(segs).toEqual([{ kind: 'cm', text: '// this is a note' }])
  })

  it('mixed: keyword, then string, then a trailing comment', () => {
    const segs = tintSegments('const s = "value" // note')
    expect(segs.map((s) => s.kind)).toEqual(['kw', 'plain', 'str', 'plain', 'cm'])
    expect(segs.find((s) => s.kind === 'str')?.text).toBe('"value"')
    expect(segs.find((s) => s.kind === 'cm')?.text).toBe('// note')
  })
})
