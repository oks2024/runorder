import { describe, it, expect } from 'vitest'
import { emitScript } from './scriptEmitter'
import { codeReviewLoop } from '@/spec/seed'
import type { WorkflowSpec } from '@/spec/schema'

describe('emitScript — runtime-faithful contract', () => {
  it('emits a meta block with the workflow name and one phase per step', () => {
    const out = emitScript(codeReviewLoop)
    expect(out).toContain('export const meta = {')
    expect(out).toContain('name: "code-review-loop"')
    expect(out).toContain(
      '{ title: "Phase 1", detail: "step — reviewer → claude-opus-4-8 · yields {context, items}" }',
    )
    expect(out).toContain(
      '{ title: "Phase 2", detail: "fan-out — investigator → claude-sonnet-4-6 (dynamic-N, cap 8) · reads reviewer" }',
    )
  })

  it('schema-forces a producer feeding a fan-out and maps its exact items', () => {
    const out = emitScript(codeReviewLoop)
    // reviewer (phase 1) feeds the fan-out → forced { context, items }
    expect(out).toContain('{ model: "claude-opus-4-8", label: "reviewer", schema: FANOUT_SCHEMA }')
    expect(out).toContain('const FANOUT_SCHEMA = {')
    // the fan-out consumes the exact array — no heuristic
    expect(out).toContain('p1.items.slice(0, 8)')
    expect(out).not.toContain('function toItems')
  })

  it('splices reads as labeled memory blocks (context of a forced producer)', () => {
    const out = emitScript(codeReviewLoop)
    // fan-out workers read the reviewer's shared context, then get their item
    expect(out).toContain('"\\n\\n[reviewer]\\n" + asText(p1.context)')
    expect(out).toContain('"\\n\\nYour assigned item:\\n" + asText(item)')
    // synthesizer reads the fan-out's full output array
    expect(out).toContain('"\\n\\n[investigator]\\n" + asText(p2)')
  })

  it('routes each stage to its resolved model via agent({ model })', () => {
    const out = emitScript(codeReviewLoop)
    expect(out).toContain('model: "claude-opus-4-8"')
    expect(out).toContain('model: "claude-sonnet-4-6"')
    expect(out).toContain('model: "claude-haiku-4-5"')
  })

  it('resolves aliases and omits model for inherit (== session model)', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      agents: [
        { id: 'a', name: 'a', model: 'opus', prompt: 'do a' },
        { id: 'b', name: 'b', model: 'inherit', prompt: 'do b' },
      ],
      root: { type: 'sequence', steps: [{ type: 'agent', agent: 'a' }, { type: 'agent', agent: 'b' }] },
    }
    const out = emitScript(spec)
    expect(out).toContain('model: "claude-opus-4-8"') // alias resolved
    // inherit agent carries a label but no model key
    expect(out).toContain('{ label: "b" }')
  })

  it('caps fan-out item count in-script (a real bound, not just concurrency)', () => {
    const out = emitScript(codeReviewLoop)
    expect(out).toContain('.slice(0, 8)')
    expect(out).toContain('await parallel(')
  })

  it('fails loud on a dangling ref rather than emitting a silently-broken stage', () => {
    const spec: WorkflowSpec = {
      ...codeReviewLoop,
      root: { type: 'sequence', steps: [{ type: 'fanout', agent: 'ghost', cap: 4 }] },
    }
    expect(emitScript(spec)).toContain('throw new Error("Unresolved agent ref \\"ghost\\"')
  })

  it('emits a bounded for-loop with a schema-driven break for a loop phase', () => {
    const spec: WorkflowSpec = {
      name: 'refine',
      caps: { concurrency: 4, total: 100 },
      agents: [{ id: 'w', name: 'writer', model: 'opus', prompt: 'Improve the draft.' }],
      root: {
        type: 'sequence',
        steps: [{ type: 'iterateUntil', body: { type: 'agent', agent: 'w' }, maxIter: 5 }],
      },
    }
    const out = emitScript(spec)
    expect(out).toContain('for (let i = 0; i < 5; i++)')
    expect(out).toContain('const LOOP_SCHEMA = {')
    expect(out).toContain('schema: LOOP_SCHEMA')
    expect(out).toContain('if (it.done) break')
    expect(out).toContain('detail: "loop — writer → claude-opus-4-8 (until done, ≤ 5)"')
  })

  it('splices a read as a labeled memory block (and defines asText for it)', () => {
    const spec: WorkflowSpec = {
      name: 'two-step',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'a', name: 'a', model: 'inherit', prompt: 'do a' },
        { id: 'b', name: 'b', model: 'inherit', prompt: 'do b' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'a', id: 'n1' },
          { type: 'agent', agent: 'b', id: 'n2', reads: ['n1'] },
        ],
      },
    }
    const out = emitScript(spec)
    expect(out).toContain('"do b" + "\\n\\n[a]\\n" + asText(p1)')
    expect(out).toContain('function asText(x)')
    expect(out).not.toContain('function toItems') // no fanout → no toItems
  })

  it('splices NOTHING when reads are empty — context never flows implicitly', () => {
    const spec: WorkflowSpec = {
      name: 'two-step',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'a', name: 'a', model: 'inherit', prompt: 'do a' },
        { id: 'b', name: 'b', model: 'inherit', prompt: 'do b' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'a', id: 'n1' },
          { type: 'agent', agent: 'b', id: 'n2' },
        ],
      },
    }
    const out = emitScript(spec)
    expect(out).not.toContain('asText(')
    expect(out).toContain('"do b",')
  })

  it('fails loud on a read that does not resolve to an earlier phase', () => {
    const spec: WorkflowSpec = {
      name: 'bad-read',
      caps: { concurrency: 4, total: 100 },
      agents: [{ id: 'a', name: 'a', model: 'inherit', prompt: 'do a' }],
      root: {
        type: 'sequence',
        steps: [{ type: 'agent', agent: 'a', id: 'n1', reads: ['ghost'] }],
      },
    }
    expect(emitScript(spec)).toContain('throw new Error("Unresolved read \\"ghost\\"')
  })

  it('feeds a fan-out from a fan-out directly (already an array — no schema, no heuristic)', () => {
    const spec: WorkflowSpec = {
      name: 'ff',
      caps: { concurrency: 4, total: 100 },
      agents: [{ id: 'a', name: 'a', model: 'inherit', prompt: 'work' }],
      root: {
        type: 'sequence',
        steps: [
          { type: 'fanout', agent: 'a', cap: 4, id: 'n1' },
          { type: 'fanout', agent: 'a', cap: 4, id: 'n2' },
        ],
      },
    }
    const out = emitScript(spec)
    expect(out).toContain('p1.slice(0, 4)')
    expect(out).not.toContain('schema: FANOUT_SCHEMA')
  })

  it('omits helpers entirely for a single step (nothing to forward-pass)', () => {
    const spec: WorkflowSpec = {
      name: 'one-step',
      caps: { concurrency: 4, total: 100 },
      agents: [{ id: 'a', name: 'a', model: 'inherit', prompt: 'do a' }],
      root: { type: 'sequence', steps: [{ type: 'agent', agent: 'a' }] },
    }
    const out = emitScript(spec)
    expect(out).not.toContain('function asText')
    expect(out).not.toContain('function toItems')
  })

  it('emits map-reduce as a capped parallel map then a reduce agent', () => {
    const spec: WorkflowSpec = {
      name: 'mr',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'm', name: 'mapper', model: 'sonnet', prompt: 'map it' },
        { id: 'r', name: 'reducer', model: 'opus', prompt: 'reduce it' },
      ],
      root: {
        type: 'sequence',
        steps: [{ type: 'mapReduce', map: { agent: 'm', cap: 6 }, reduce: 'r' }],
      },
    }
    const out = emitScript(spec)
    expect(out).toContain('toItems(args).slice(0, 6)')
    expect(out).toContain('Items to merge:\\n" + asText(p1_mapped)')
    expect(out).toContain('detail: "map-reduce — mapper → claude-sonnet-4-6 ×6 → reduce reducer → claude-opus-4-8"')
  })

  it('emits adversarial as producer then critic over the draft', () => {
    const spec: WorkflowSpec = {
      name: 'adv',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'p', name: 'maker', model: 'opus', prompt: 'make it' },
        { id: 'c', name: 'breaker', model: 'sonnet', prompt: 'break it' },
      ],
      root: { type: 'sequence', steps: [{ type: 'adversarial', producer: 'p', critic: 'c' }] },
    }
    const out = emitScript(spec)
    expect(out).toContain('const p1_draft = await agent(')
    expect(out).toContain('Proposal to critique:\\n" + asText(p1_draft)')
    expect(out).toContain('const p1 = { draft: p1_draft, critique: p1_critique }')
  })

  it('emits multi-angle as N parallel takes then a vote agent', () => {
    const spec: WorkflowSpec = {
      name: 'ma',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'w', name: 'thinker', model: 'sonnet', prompt: 'consider' },
        { id: 'v', name: 'judge', model: 'opus', prompt: 'pick best' },
      ],
      root: { type: 'sequence', steps: [{ type: 'multiAngle', agent: 'w', angles: 3, vote: 'v' }] },
    }
    const out = emitScript(spec)
    expect(out).toContain('Array.from({ length: 3 }, (_, k) => () =>')
    expect(out).toContain('label: "thinker (angle " + (k + 1) + ")"')
    expect(out).toContain('Candidate answers:\\n" + asText(p1_takes)')
  })

  it('emits A+ delegation as a lead agent then a capped fan-out of the grantee', () => {
    const spec: WorkflowSpec = {
      name: 'delegate',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'lead', name: 'lead', model: 'opus', prompt: 'lead it' },
        { id: 'inv', name: 'inv', model: 'sonnet', prompt: 'investigate' },
      ],
      root: {
        type: 'sequence',
        steps: [{ type: 'agent', agent: 'lead', grants: [{ agent: 'inv', cap: 4 }] }],
      },
    }
    const out = emitScript(spec)
    expect(out).toContain('const p1_lead = await agent(')
    // the lead is schema-forced; grantees work the exact item list + the lead's context
    expect(out).toContain('label: "lead", schema: FANOUT_SCHEMA')
    expect(out).toContain('p1_lead.items.slice(0, 4)')
    expect(out).toContain('"\\n\\n[lead context]\\n" + p1_lead.context')
    expect(out).toContain('detail: "step — lead → claude-opus-4-8 (delegates ≤ 4 to inv → claude-sonnet-4-6)"')
  })

  it('is deterministic (same spec → identical output)', () => {
    expect(emitScript(codeReviewLoop)).toBe(emitScript(codeReviewLoop))
  })

  it('matches the golden script for the code-review-loop seed', () => {
    expect(emitScript(codeReviewLoop)).toMatchInlineSnapshot(`
      "// Dynamic workflow — generated by Prewire (one-way export; edit the spec, not this file).
      // Target: claude-code dynamic-workflow runtime · probed 2026-07-02
      // Caps — concurrency 8, total 1000 (fan-out counts are capped in-script; concurrency is the runtime's global cap).
      // Context flow is explicit: each agent receives ONLY the [memory] blocks its phase reads (plus its pattern's own piping).

      export const meta = {
        name: "code-review-loop",
        description: "code-review-loop",
        phases: [
          { title: "Phase 1", detail: "step — reviewer → claude-opus-4-8 · yields {context, items}" },
          { title: "Phase 2", detail: "fan-out — investigator → claude-sonnet-4-6 (dynamic-N, cap 8) · reads reviewer" },
          { title: "Phase 3", detail: "step — synthesizer → claude-haiku-4-5 · reads investigator" },
        ],
      }

      // --- generated helpers ---
      function asText(x) {
        return typeof x === "string" ? x : JSON.stringify(x, null, 2)
      }
      // A producer that feeds a fan-out returns shared context + the exact item list
      // (runtime-enforced): downstream readers get \`context\`, the fan-out maps \`items\`.
      const FANOUT_SCHEMA = {
        type: "object",
        properties: {
          context: { type: "string", description: "shared context every downstream reader needs (setting, constraints, decisions)" },
          items: { type: "array", items: { type: "string" }, description: "the list to fan out over — one self-contained work item per element" },
        },
        required: ["context", "items"],
      }

      phase("Phase 1")
      const p1 = await agent(
        "Review the diff on the current branch for correctness bugs and security issues. Group findings by severity and output one finding per item.",
        { model: "claude-opus-4-8", label: "reviewer", schema: FANOUT_SCHEMA },
      )

      phase("Phase 2")
      const p2 = (await parallel(
        p1.items.slice(0, 8).map((item) => () =>
          agent(
            "Given a single finding, reproduce it, trace the root cause, and propose the minimal fix." + "\\n\\n[reviewer]\\n" + asText(p1.context) + "\\n\\nYour assigned item:\\n" + asText(item),
            { model: "claude-sonnet-4-6", label: "investigator" },
          ),
        ),
      )).filter(Boolean)

      phase("Phase 3")
      const p3 = await agent(
        "Merge all investigation reports into one ranked review summary with clear next actions." + "\\n\\n[investigator]\\n" + asText(p2),
        { model: "claude-haiku-4-5", label: "synthesizer" },
      )

      return p3"
    `)
  })
})
