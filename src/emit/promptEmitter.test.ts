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

  it('renders a loop phase (repeat one agent until done, bounded by maxIter)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      agents: [{ id: 'w', name: 'writer', model: 'opus', prompt: 'Improve the draft.' }],
      root: {
        type: 'sequence',
        steps: [{ type: 'iterateUntil', body: { type: 'agent', agent: 'w' }, maxIter: 5 }],
      },
    }
    expect(emitPrompt(spec)).toContain('writer repeated until it reports done (≤ 5 iterations)')
  })

  it('renders refine and verify as closed constraints (revise-until-approved, majority gate)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      agents: [
        { id: 'd', name: 'drafter', model: 'opus', prompt: 'draft' },
        { id: 'j', name: 'judge', model: 'sonnet', prompt: 'judge' },
        { id: 's', name: 'skeptic', model: 'haiku', prompt: 'refute' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'refine', producer: 'd', critic: 'j', maxIter: 4, id: 'n1' },
          { type: 'verify', skeptic: 's', votes: 3, cap: 6, id: 'n2' },
        ],
      },
    }
    const out = emitPrompt(spec)
    expect(out).toContain(
      '1. refine  — drafter drafts, judge judges approve/reject with a critique; revise against the critique until approved (≤ 4 rounds); the phase output is the final draft',
    )
    expect(out).toContain(
      '2. verify  — skeptic casts 3 independent refutation votes per item of the prior output (≤ 6 items); keep ONLY items whose refutals are a strict minority — the phase output is the surviving items',
    )
  })

  it('renders branches as distinct agents run in parallel with labeled outputs', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      agents: [
        { id: 'c', name: 'cast', model: 'sonnet', prompt: 'c' },
        { id: 'w', name: 'world', model: 'haiku', prompt: 'w' },
      ],
      root: { type: 'sequence', steps: [{ type: 'branches', branches: ['c', 'w'] }] },
    }
    expect(emitPrompt(spec)).toContain(
      "1. branch  — cast, world run once each, IN PARALLEL, on the same reads; keep every output separate and labeled with its agent's name — the phase output is that labeled set, in branch order",
    )
  })

  it('renders the composite patterns (map-reduce, adversarial, multi-angle, delegate)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      agents: [
        { id: 'a', name: 'alpha', model: 'opus', prompt: 'a' },
        { id: 'b', name: 'beta', model: 'sonnet', prompt: 'b' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'mapReduce', map: { agent: 'a', cap: 4 }, reduce: 'b' },
          { type: 'adversarial', producer: 'a', critic: 'b' },
          { type: 'multiAngle', agent: 'a', angles: 3, vote: 'b' },
          { type: 'agent', agent: 'a', grants: [{ agent: 'b', cap: 2 }] },
        ],
      },
    }
    const out = emitPrompt(spec)
    expect(out).toContain('alpha over prior output (cap 4), then beta reduces the results')
    expect(out).toContain('alpha produces, then beta critiques it')
    expect(out).toContain('alpha from 3 angles, then beta votes on the best')
    expect(out).toContain('may delegate to beta, ≤ 2 instances')
  })

  it('states each phase reads and the fan-out list format (intended, not enforced)', () => {
    const out = emitPrompt(codeReviewLoop)
    expect(out).toContain('context flows ONLY through the reads listed per phase')
    expect(out).toContain('· reads: reviewer')
    expect(out).toContain('· reads: investigator')
    // the reviewer feeds the fan-out → list-format instruction on ITS phase line
    expect(out).toMatch(/1\. step {4}— reviewer.*must END its output with ONLY the list of items/)
  })

  it('marks an unresolvable read instead of dropping it silently', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: {
        type: 'sequence',
        steps: [{ type: 'agent', agent: 'reviewer', id: 'n1', reads: ['ghost'] }],
      },
    }
    expect(emitPrompt(spec)).toContain('«ghost?»')
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

      ## Phases (ordered top→down; context flows ONLY through the reads listed per phase)
      Each phase output is a named memory (the agent name below). Give an agent EXACTLY the
      memories its phase reads — nothing else flows implicitly. These are the tool's intended
      semantics; the script path enforces them, this prompt path asks you to honor them.
      1. step    — reviewer · must END its output with ONLY the list of items to fan out over, one per blank-line-separated block (shared context first, clearly separated)
      2. fan-out — investigator over phase 1 output (dynamic-N, cap 8) · reads: reviewer
      3. step    — synthesizer · reads: investigator

      Before running, show the planned phases, the model per stage, and the per-stage caps for approval."
    `)
  })
})
