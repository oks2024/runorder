import { describe, it, expect } from 'vitest'
import { emitScript, emitScriptLines } from './scriptEmitter'
import { PROV_INPUT } from '@/lib/prov'
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

  it('splices FANOUT_NOTE into the forced producer prompt (context = full work product)', () => {
    const out = emitScript(codeReviewLoop)
    // the injected split is explained to the agent, on the producer's own prompt
    expect(out).toContain('const FANOUT_NOTE = ')
    expect(out).toContain('+ asText(args) + FANOUT_NOTE,')
    // the note appears exactly once — never on unforced agents (fan-out worker, synthesizer)
    expect(out.match(/ \+ FANOUT_NOTE,/g)).toHaveLength(1)
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
    expect(out).not.toContain('FANOUT_NOTE') // no forced producer → no note either
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
    expect(out).toContain('"lead it" + FANOUT_NOTE,') // the lead learns what its context is for
    expect(out).toContain('p1_lead.items.slice(0, 4)')
    expect(out).toContain('"\\n\\n[lead context]\\n" + p1_lead.context')
    expect(out).toContain('detail: "step — lead → claude-opus-4-8 (delegates ≤ 4 to inv → claude-sonnet-4-6)"')
  })

  it('emits refine as a bounded draft→judge loop with a schema-driven approval break', () => {
    const spec: WorkflowSpec = {
      name: 'refine',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'd', name: 'drafter', model: 'opus', prompt: 'draft it' },
        { id: 'j', name: 'judge', model: 'sonnet', prompt: 'judge it' },
      ],
      root: {
        type: 'sequence',
        steps: [{ type: 'refine', producer: 'd', critic: 'j', maxIter: 4 }],
      },
    }
    const out = emitScript(spec)
    expect(out).toContain('for (let i = 0; i < 4; i++)')
    expect(out).toContain('const REFINE_SCHEMA = {')
    expect(out).toContain('{ model: "claude-sonnet-4-6", label: "judge", schema: REFINE_SCHEMA }')
    expect(out).toContain('if (verdict == null || verdict.approved) break')
    expect(out).toContain('Critique to address:\\n" + asText(p1_note)')
    expect(out).toContain(
      'detail: "refine — drafter → claude-opus-4-8 ⇄ judge → claude-sonnet-4-6 (revise until approved, ≤ 4)"',
    )
    // The critique drives the NEXT revision — it is never part of the phase's memory.
    expect(out).toContain('return p1')
  })

  it('emits verify as a per-item refuter jury with an in-script majority gate', () => {
    const spec: WorkflowSpec = {
      name: 'verify',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'f', name: 'finder', model: 'opus', prompt: 'find issues' },
        { id: 's', name: 'skeptic', model: 'haiku', prompt: 'refute it' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'f', id: 'n1' },
          { type: 'verify', skeptic: 's', votes: 3, cap: 6, id: 'n2' },
        ],
      },
    }
    const out = emitScript(spec)
    // The finder feeds an item-consumer → forced { context, items }; verify maps the exact array.
    expect(out).toContain('{ model: "claude-opus-4-8", label: "finder", schema: FANOUT_SCHEMA }')
    expect(out).toContain('const p2_pool = p1.items.slice(0, 6)')
    // Three schema-enforced votes per item, then the deterministic gate.
    expect(out).toContain('Array.from({ length: 3 }, (_, k) => () =>')
    expect(out).toContain('label: "skeptic (vote " + (k + 1) + ")", schema: VERDICT_SCHEMA')
    expect(out).toContain('const VERDICT_SCHEMA = {')
    expect(out).toContain('vs.filter((v) => v.refuted).length * 2 < vs.length')
    expect(out).toContain(
      'detail: "verify — skeptic → claude-haiku-4-5 ×3 votes per item (majority gate, cap 6)"',
    )
  })

  it('emits branches as heterogeneous parallel agents with per-branch labeled reads', () => {
    const spec: WorkflowSpec = {
      name: 'br',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'set', name: 'setting', model: 'opus', prompt: 'invent a setting' },
        { id: 'c', name: 'cast', model: 'sonnet', prompt: 'create the cast' },
        { id: 'w', name: 'world', model: 'haiku', prompt: 'map the world' },
        { id: 'wr', name: 'writer', model: 'opus', prompt: 'write the story' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'set', id: 'n1' },
          { type: 'branches', branches: ['c', 'w'], id: 'n2', reads: ['n1'] },
          { type: 'agent', agent: 'wr', id: 'n3', reads: ['n2'] },
        ],
      },
    }
    const out = emitScript(spec)
    // one parallel() with one thunk per branch; every branch gets the same reads
    expect(out).toContain('const p2 = await parallel([')
    expect(out).toContain('"create the cast" + "\\n\\n[setting]\\n" + asText(p1)')
    expect(out).toContain('"map the world" + "\\n\\n[setting]\\n" + asText(p1)')
    // per-branch pinned models are routed literally
    expect(out).toContain('{ model: "claude-sonnet-4-6", label: "cast" }')
    expect(out).toContain('{ model: "claude-haiku-4-5", label: "world" }')
    // a reader of the branches memory gets one labeled block PER BRANCH, by index
    expect(out).toContain(
      '"write the story" + "\\n\\n[cast]\\n" + asText(p2[0]) + "\\n\\n[world]\\n" + asText(p2[1])',
    )
    expect(out).toContain(
      'detail: "branches — cast → claude-sonnet-4-6 ∥ world → claude-haiku-4-5 (parallel, once each) · reads setting"',
    )
    // the reader's detail names the joined branches memory
    expect(out).toContain('detail: "step — writer → claude-opus-4-8 · reads cast+world"')
  })

  it('feeds a fan-out from branches directly (exact array of branch outputs)', () => {
    const spec: WorkflowSpec = {
      name: 'bf',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'c', name: 'cast', model: 'inherit', prompt: 'create the cast' },
        { id: 'w', name: 'world', model: 'inherit', prompt: 'map the world' },
        { id: 'x', name: 'expander', model: 'inherit', prompt: 'expand it' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'branches', branches: ['c', 'w'], id: 'n1' },
          { type: 'fanout', agent: 'x', cap: 4, id: 'n2' },
        ],
      },
    }
    const out = emitScript(spec)
    // branch outputs are already an exact array — sliced directly, no schema, no heuristic
    expect(out).toContain('p1.slice(0, 4)')
    expect(out).not.toContain('toItems(p1)')
    expect(out).not.toContain('schema: FANOUT_SCHEMA')
  })

  it('feeds a fan-out from verify survivors directly (already an exact array)', () => {
    const spec: WorkflowSpec = {
      name: 'vf',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 's', name: 'skeptic', model: 'inherit', prompt: 'refute' },
        { id: 'w', name: 'worker', model: 'inherit', prompt: 'work' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'verify', skeptic: 's', votes: 1, cap: 4, id: 'n1' },
          { type: 'fanout', agent: 'w', cap: 4, id: 'n2' },
        ],
      },
    }
    const out = emitScript(spec)
    // survivors are an exact array — the downstream fan-out slices it, no schema, no heuristic
    expect(out).toContain('p1.slice(0, 4)')
    expect(out).not.toContain('toItems(p1)')
  })

  describe('launch input (args)', () => {
    it('splices the declared input into a plain first step as a labeled [label] block', () => {
      const out = emitScript(codeReviewLoop) // seed declares input { label: 'changelist' }
      expect(out).toContain(
        '// Launch input (args): changelist — Perforce CL to review — spliced into phase 1 as a [changelist] block.',
      )
      // the phase-1 reviewer prompt ends with the input block over asText(args)
      expect(out).toContain('"\\n\\n[changelist]\\n" + asText(args)')
    })

    it('emits no input block when the workflow declares no input', () => {
      const noInput: WorkflowSpec = { ...codeReviewLoop, input: undefined }
      const out = emitScript(noInput)
      expect(out).not.toContain('Launch input (args)')
      expect(out).not.toContain('[changelist]')
    })

    it('does not double-splice when the first phase already consumes args as items', () => {
      // phase 1 is itself a fan-out → args are the items (toItems(args)); the prose block
      // would be redundant, so it is omitted.
      const spec: WorkflowSpec = {
        name: 'input-fanout',
        input: { label: 'files', description: 'paths to review' },
        caps: { concurrency: 8, total: 1000 },
        agents: [{ id: 'w', name: 'worker', model: 'inherit', prompt: 'work an item' }],
        root: { type: 'sequence', steps: [{ type: 'fanout', agent: 'w', cap: 4, id: 'n1' }] },
      }
      const out = emitScript(spec)
      expect(out).toContain('toItems(args)') // args still drive the items
      expect(out).not.toContain('[files]') // no redundant prose block
      // the header note still documents the input
      expect(out).toContain('// Launch input (args): files')
    })

    it('lights PROV_INPUT on EVERY agent line of a phase-0 multi-agent pattern', () => {
      // A multiAngle first phase splices the input (via the shared reads suffix) into both the
      // angle workers AND the voter. Provenance must light on both so the InputNote hover is
      // two-way — not just on the primary worker line.
      const spec: WorkflowSpec = {
        name: 'input-multiangle',
        input: { label: 'topic', description: 'what to decide' },
        caps: { concurrency: 8, total: 1000 },
        agents: [
          { id: 't', name: 'taker', model: 'inherit', prompt: 'take an angle' },
          { id: 'v', name: 'voter', model: 'inherit', prompt: 'pick best' },
        ],
        root: {
          type: 'sequence',
          steps: [{ type: 'multiAngle', agent: 't', angles: 3, vote: 'v', id: 'm1' }],
        },
      }
      // both the worker take AND the voter prompt lines carry the input block, and both light
      // PROV_INPUT (the worker via `prompt`, the voter via `prompt2`) — not just the primary.
      // The header `// Launch input (args)…` comment also mentions [topic], so exclude it.
      const promptLines = emitScriptLines(spec).filter(
        (l) => l.text.includes('[topic]') && !l.text.startsWith('//'),
      )
      expect(promptLines).toHaveLength(2)
      for (const l of promptLines) expect(l.prov ?? []).toContain(PROV_INPUT)
    })
  })

  it('is deterministic (same spec → identical output)', () => {
    expect(emitScript(codeReviewLoop)).toBe(emitScript(codeReviewLoop))
  })

  it('matches the golden script for the code-review-loop seed', () => {
    expect(emitScript(codeReviewLoop)).toMatchInlineSnapshot(`
      "// Dynamic workflow — generated by Runorder (one-way export; edit the spec, not this file).
      // Target: claude-code dynamic-workflow runtime · probed 2026-07-02
      // Caps — concurrency 8, total 1000 (fan-out counts are capped in-script; concurrency is the runtime's global cap).
      // Context flow is explicit: each agent receives ONLY the [memory] blocks its phase reads (plus its pattern's own piping).
      // Launch input (args): changelist — Perforce CL to review — spliced into phase 1 as a [changelist] block.

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
      // A producer that feeds a fan-out returns the exact item list plus \`context\` — the ONLY
      // other part of its output that flows onward (runtime-enforced): the fan-out maps \`items\`;
      // downstream readers get \`context\`.
      const FANOUT_SCHEMA = {
        type: "object",
        properties: {
          context: { type: "string", description: "everything downstream needs from you — your complete findings/results, in full, plus any shared setting or constraints; apart from the items, this is the ONLY part of your output that flows onward" },
          items: { type: "array", items: { type: "string" }, description: "the list to fan out over — one self-contained work item per element" },
        },
        required: ["context", "items"],
      }
      // Spliced into every schema-forced producer prompt — the output split is plumbing the
      // author never wrote, so the tool explains it to the agent.
      const FANOUT_NOTE = "\\n\\nYour output is split in two: each entry in \`items\` becomes one downstream agent's work item; \`context\` is the ONLY other part of your output that flows onward — to the item workers and to any later phase that reads this one. Put your complete findings/results in \`context\`, in full, not a summary."

      phase("Phase 1")
      const p1 = await agent(
        "Run \`p4 describe -S\` on the changelist below to fetch its diff, then review it for correctness bugs and security issues. Group findings by severity and output one finding per item." + "\\n\\n[changelist]\\n" + asText(args) + FANOUT_NOTE,
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
