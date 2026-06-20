import { describe, it, expect } from 'vitest'
import { emitPrompt } from './promptEmitter'
import { codeReviewLoop } from '@/spec/seed'
import type { WorkflowSpec } from '@/spec/schema'

describe('emitPrompt — faithfulness contract', () => {
  it('triggers the mechanism and states closed-set constraints', () => {
    const out = emitPrompt(codeReviewLoop)
    expect(out).toContain('dynamic workflow (ultracode)')
    expect(out).toContain('do not add, remove, merge, or re-model any stage')
    expect(out).toContain('Before running, show the planned phases')
  })

  it('labels caps as intended, not enforced', () => {
    const out = emitPrompt(codeReviewLoop)
    expect(out).toContain('Caps — concurrency: 8, total: 1000  (intended bounds, not runtime-enforced)')
  })

  it('resolves model aliases to canonical full ids on emit', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      agents: [{ id: 'a', name: 'a', model: 'opus', prompt: 'do a thing' }],
      root: { type: 'sequence', steps: [{ type: 'agent', agent: 'a' }] },
    }
    const out = emitPrompt(spec)
    expect(out).toContain('a → claude-opus-4-8')
    expect(out).not.toMatch(/→ opus$/m)
  })

  it('renders inherit as the session model', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      agents: [{ id: 'a', name: 'a', model: 'inherit', prompt: '' }],
      root: { type: 'sequence', steps: [{ type: 'agent', agent: 'a' }] },
    }
    expect(emitPrompt(spec)).toContain('a → inherit (session model)')
  })

  it('numbers phases and describes the fan-out (dynamic-N, cap, over prior phase)', () => {
    const out = emitPrompt(codeReviewLoop)
    expect(out).toContain('1. step    — reviewer')
    expect(out).toContain('2. fan-out — investigator over phase 1 output (dynamic-N, cap 8)')
    expect(out).toContain('3. step    — synthesizer')
  })

  it('marks a dangling agent ref rather than dropping it silently', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: { type: 'sequence', steps: [{ type: 'fanout', agent: 'ghost', cap: 4 }] },
    }
    expect(emitPrompt(spec)).toContain('«missing agent: ghost»')
  })

  it('is deterministic (same spec → identical output)', () => {
    expect(emitPrompt(codeReviewLoop)).toBe(emitPrompt(codeReviewLoop))
  })

  it('matches the golden artifact for the code-review-loop seed', () => {
    expect(emitPrompt(codeReviewLoop)).toMatchInlineSnapshot(`
      "Run the following as a dynamic workflow (ultracode).
      Use EXACTLY these agents, models, and phases — do not add, remove, merge, or re-model any stage.
      You write the orchestration control-flow; the spec below fixes the agents, models, topology, and caps.

      # Workflow: code-review-loop
      Caps — concurrency: 8, total: 1000  (intended bounds, not runtime-enforced)

      ## Agents (model is authoritative — pin each stage to exactly this model)
      - reviewer → claude-opus-4-8
          Review the diff on the current branch for correctness bugs and security issues. Group findings by severity and output one finding per item.
      - investigator → claude-sonnet-4-6
          Given a single finding, reproduce it, trace the root cause, and propose the minimal fix.
      - synthesizer → claude-haiku-4-5
          Merge all investigation reports into one ranked review summary with clear next actions.

      ## Phases (ordered top→down; each phase passes its results forward)
      1. step    — reviewer
      2. fan-out — investigator over phase 1 output (dynamic-N, cap 8)
      3. step    — synthesizer

      Before running, show the planned phases, the model per stage, and the per-stage caps for approval."
    `)
  })
})
