import { describe, it, expect } from 'vitest'
import { rehearse } from './rehearse'
import type { ReceiveSegment } from './rehearse'
import { codeReviewLoop } from '@/spec/seed'
import type { WorkflowSpec } from '@/spec/schema'

/** Helper: the first segment of a given kind in a receives list. */
function seg<K extends ReceiveSegment['kind']>(
  receives: ReceiveSegment[],
  kind: K,
): Extract<ReceiveSegment, { kind: K }> | undefined {
  return receives.find((s): s is Extract<ReceiveSegment, { kind: K }> => s.kind === kind)
}

describe('rehearse — seed at the cap ceiling', () => {
  const r = rehearse(codeReviewLoop)

  it('has three ticks with the mockup seat gauges', () => {
    expect(r.ticks.map((t) => t.label)).toEqual(['T1', 'T2', 'T3'])
    expect(r.ticks.map((t) => t.seatsUsed)).toEqual([1, 8, 1])
    // the 8 workers exactly fill the concurrency cap — nothing queues, nothing drops
    expect(r.ticks.map((t) => t.queued)).toEqual([0, 0, 0])
  })

  it('tallies 10 agents, breakdown "1 + 8∥ + 1", peak 8', () => {
    expect(r.totalAgents).toBe(10)
    expect(r.breakdown).toBe('1 + 8∥ + 1')
    expect(r.peakSeats).toBe(8)
  })

  it('instantiates the fan-out at exactly its cap (8), all live, none dropped', () => {
    const t2 = r.ticks[1]
    expect(t2.kind).toBe('fanout')
    expect(t2.instances).toHaveLength(8)
    expect(t2.instances.map((i) => i.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // every card actually runs → non-empty receives
    expect(t2.instances.every((i) => i.receives.length > 0)).toBe(true)
  })

  it('discloses the truncation with a calm note (no red alarm)', () => {
    const t2 = r.ticks[1]
    expect(t2.note).toBe(
      "takes the first 8 item(s) the producer yields — any beyond 8 aren't processed",
    )
  })

  it('labels the two flow gaps between phases', () => {
    expect(r.gaps).toEqual([
      {
        afterTickIndex: 0,
        memoryName: 'reviewer',
        countLabel: 'reviewer.items[] — up to 8 taken (cap)',
      },
      { afterTickIndex: 1, memoryName: 'investigator', countLabel: 'investigator — 8 outputs' },
    ])
  })

  it('assembles worker #3 exactly as the anatomy card shows', () => {
    const w3 = r.ticks[1].instances[2]
    expect(w3.agentName).toBe('investigator')
    expect(w3.model).toBe('claude-sonnet-4-6')
    expect(w3.role).toBe('worker')
    expect(w3.n).toBe(3)

    // The full ordered input a single worker receives.
    expect(w3.receives.map((s) => s.kind)).toEqual(['system', 'read', 'item', 'prompt', 'returns'])

    expect(seg(w3.receives, 'system')!.text).toBe(
      'model claude-sonnet-4-6 · enforced · seat granted by parallel(), cap 8',
    )

    const read = seg(w3.receives, 'read')!
    expect(read.memoryName).toBe('reviewer')
    expect(read.fromAgent).toBe('reviewer')
    expect(read.source).toBe('spliced because this phase reads → reviewer')

    const item = seg(w3.receives, 'item')!
    expect(item.index).toBe(3)
    expect(item.total).toBe(8)
    expect(item.source).toBe('from reviewer.items[2] — exact array, not a string split')

    expect(seg(w3.receives, 'prompt')!.text).toContain('trace the root cause')

    const ret = seg(w3.receives, 'returns')!
    expect(ret.shape).toBe('free text')
    expect(ret.collectedInto).toBe('investigator')
  })

  it("marks the schema-forced producer's return and the final step's sink", () => {
    // reviewer feeds the fan-out → forced to { context, items }
    const reviewer = r.ticks[0].instances[0]
    expect(seg(reviewer.receives, 'system')!.text).toBe('model claude-opus-4-8 · enforced')
    expect(seg(reviewer.receives, 'returns')).toEqual({
      kind: 'returns',
      shape: '{ context, items } (runtime-enforced)',
      collectedInto: 'reviewer',
    })
    // synthesizer is the last phase → collects into the run's final output
    const synth = r.ticks[2].instances[0]
    expect(seg(synth.receives, 'read')!.memoryName).toBe('investigator')
    expect(seg(synth.receives, 'returns')).toEqual({
      kind: 'returns',
      shape: 'free text',
      collectedInto: 'final output of the run',
    })
  })
})

/** All seven patterns, one per phase, so every expansion path is exercised. */
const allPatterns: WorkflowSpec = {
  name: 'all-patterns',
  caps: { concurrency: 8, total: 1000 },
  agents: [
    { id: 'a-step', name: 'stepper', model: 'claude-opus-4-8', prompt: 'do the thing' },
    { id: 'a-fan', name: 'worker', model: 'claude-sonnet-4-6', prompt: 'work one item' },
    { id: 'a-loop', name: 'refiner', model: 'claude-haiku-4-5', prompt: 'refine' },
    { id: 'a-map', name: 'mapper', model: 'claude-sonnet-4-6', prompt: 'map one' },
    { id: 'a-red', name: 'reducer', model: 'claude-opus-4-8', prompt: 'reduce all' },
    { id: 'a-prod', name: 'producer', model: 'claude-sonnet-4-6', prompt: 'draft it' },
    { id: 'a-crit', name: 'critic', model: 'claude-opus-4-8', prompt: 'attack it' },
    { id: 'a-take', name: 'taker', model: 'claude-sonnet-4-6', prompt: 'one take' },
    { id: 'a-vote', name: 'voter', model: 'claude-opus-4-8', prompt: 'pick best' },
    { id: 'a-lead', name: 'lead', model: 'claude-opus-4-8', prompt: 'plan sub-tasks' },
    { id: 'a-help', name: 'helper', model: 'claude-sonnet-4-6', prompt: 'do a sub-task' },
  ],
  root: {
    type: 'sequence',
    steps: [
      { type: 'agent', agent: 'a-step', id: 'p0' },
      { type: 'fanout', agent: 'a-fan', cap: 8, id: 'p1', reads: ['p0'] },
      { type: 'iterateUntil', body: { type: 'agent', agent: 'a-loop' }, maxIter: 3, id: 'p2', reads: ['p1'] },
      { type: 'mapReduce', map: { agent: 'a-map', cap: 8 }, reduce: 'a-red', id: 'p3', reads: ['p2'] },
      { type: 'adversarial', producer: 'a-prod', critic: 'a-crit', id: 'p4', reads: ['p3'] },
      { type: 'multiAngle', agent: 'a-take', angles: 3, vote: 'a-vote', id: 'p5', reads: ['p4'] },
      { type: 'agent', agent: 'a-lead', grants: [{ agent: 'a-help', cap: 2 }], id: 'p6', reads: ['p5'] },
    ],
  },
}

describe('rehearse — all seven patterns', () => {
  const r = rehearse(allPatterns)

  it('produces the expected tick shape (1+1+1+2+2+2+2 = 11)', () => {
    expect(r.ticks).toHaveLength(11)
    expect(r.ticks.map((t) => t.kind)).toEqual([
      'step',
      'fanout',
      'loop',
      'mapReduce',
      'mapReduce',
      'adversarial',
      'adversarial',
      'multiAngle',
      'multiAngle',
      'delegate',
      'delegate',
    ])
    expect(r.ticks.map((t) => t.stage)).toEqual([
      undefined,
      undefined,
      undefined,
      'map',
      'reduce',
      'draft',
      'critique',
      'takes',
      'vote',
      'lead',
      'delegates',
    ])
  })

  it('assigns each instance its role', () => {
    const roleOf = (tick: number, inst = 0) => r.ticks[tick].instances[inst].role
    expect(roleOf(0)).toBe('solo')
    expect(roleOf(1)).toBe('worker')
    expect(roleOf(2)).toBe('loop-body')
    expect(roleOf(3)).toBe('mapper')
    expect(roleOf(4)).toBe('reducer')
    expect(roleOf(5)).toBe('producer')
    expect(roleOf(6)).toBe('critic')
    expect(roleOf(7)).toBe('take')
    expect(roleOf(8)).toBe('voter')
    expect(roleOf(9)).toBe('lead')
    expect(roleOf(10)).toBe('grantee')
  })

  it('renders the fan-out and map at their caps (8 each)', () => {
    expect(r.ticks[1].instances).toHaveLength(8)
    expect(r.ticks[3].instances).toHaveLength(8)
  })

  it('gives the loop a bounded, sequential note and a {done, output} return', () => {
    const loop = r.ticks[2]
    expect(loop.note).toBe('× up to 3, sequential — may stop early')
    expect(loop.instances).toHaveLength(1)
    const ret = seg(loop.instances[0].receives, 'returns')!
    expect(ret.shape).toBe('{ done, output } (runtime-enforced)')
  })

  it('gives multi-angle takes an angle marker but NO item segment', () => {
    const takes = r.ticks[7]
    expect(takes.instances).toHaveLength(3)
    for (let k = 0; k < 3; k++) {
      const t = takes.instances[k]
      expect(t.receives.some((s) => s.kind === 'item')).toBe(false)
      expect(seg(t.receives, 'system')!.text).toContain(`angle ${k + 1} of 3 — independent take`)
    }
  })

  it('renders delegate grantees at exactly the grant cap, with a calm note', () => {
    const delegates = r.ticks[10]
    expect(delegates.instances).toHaveLength(2) // grant cap 2
    expect(delegates.note).toBe(
      "takes the first 2 item(s) the producer yields — any beyond 2 aren't processed",
    )
    // a grantee reads the lead's intra-phase context (not a named memory) + its item
    const g1 = delegates.instances[0]
    expect(seg(g1.receives, 'read')!.source).toContain('intra-phase')
    expect(seg(g1.receives, 'item')!.source).toContain("from the lead's item list [0]")
    // the lead is schema-forced to { context, items }
    const lead = r.ticks[9].instances[0]
    expect(seg(lead.receives, 'returns')!.shape).toBe('{ context, items } (runtime-enforced)')
  })

  it('splices each phase read from the preceding memory', () => {
    // the reducer (2nd stage of phase 3) still gets the phase's read
    const reducer = r.ticks[4].instances[0]
    expect(seg(reducer.receives, 'read')!.memoryName).toBe('refiner')
  })

  it('propagates item provenance (schema-forced → exact; heuristic split otherwise)', () => {
    // fan-out fed by the schema-forced step → exact array
    expect(seg(r.ticks[1].instances[0].receives, 'item')!.source).toContain('.items[0] — exact array')
    // map fed by the loop output → heuristic split of the previous output
    expect(seg(r.ticks[3].instances[0].receives, 'item')!.source).toBe(
      'from a heuristic split of the previous output',
    )
  })
})

describe('rehearse — refine (bounded revise loop)', () => {
  const spec: WorkflowSpec = {
    name: 'refine',
    caps: { concurrency: 4, total: 100 },
    agents: [
      { id: 'd', name: 'drafter', model: 'claude-opus-4-8', prompt: 'draft it' },
      { id: 'j', name: 'judge', model: 'claude-sonnet-4-6', prompt: 'judge it' },
    ],
    root: { type: 'sequence', steps: [{ type: 'refine', producer: 'd', critic: 'j', maxIter: 4, id: 'n0' }] },
  }
  const r = rehearse(spec)

  it('runs two sequential ticks (draft, judge) with the revision-loop note', () => {
    expect(r.ticks.map((t) => t.stage)).toEqual(['draft', 'judge'])
    expect(r.ticks[0].note).toBe('× up to 4 revisions, sequential — stops when approved')
    expect(r.breakdown).toBe('1 + 1')
    expect(r.totalAgents).toBe(2)
  })

  it('gives the judge the {approved, critique} return and the drafter the phase memory', () => {
    const drafter = r.ticks[0].instances[0]
    expect(drafter.role).toBe('producer')
    expect(seg(drafter.receives, 'returns')!.collectedInto).toBe('final output of the run')
    const judge = r.ticks[1].instances[0]
    expect(judge.role).toBe('critic')
    expect(seg(judge.receives, 'returns')!.shape).toBe('{ approved, critique } (runtime-enforced)')
    expect(seg(judge.receives, 'returns')!.collectedInto).toContain('gates')
  })
})

describe('rehearse — verify (per-item refuter jury, majority gate)', () => {
  const spec: WorkflowSpec = {
    name: 'verify',
    caps: { concurrency: 8, total: 1000 },
    agents: [
      { id: 'f', name: 'finder', model: 'claude-opus-4-8', prompt: 'find issues' },
      { id: 's', name: 'skeptic', model: 'claude-haiku-4-5', prompt: 'refute it' },
      { id: 'w', name: 'fixer', model: 'claude-sonnet-4-6', prompt: 'fix one' },
    ],
    root: {
      type: 'sequence',
      steps: [
        { type: 'agent', agent: 'f', id: 'n0' },
        { type: 'verify', skeptic: 's', votes: 3, cap: 4, id: 'n1' },
        { type: 'fanout', agent: 'w', cap: 8, id: 'n2' },
      ],
    },
  }
  const r = rehearse(spec)

  it('convenes a jury per capped item at the cap ceiling, with the truncation note', () => {
    const t = r.ticks[1]
    expect(t.kind).toBe('verify')
    expect(t.note).toBe(
      "majority gate — survivors decided at run time · takes the first 4 item(s) the producer yields — any beyond 4 aren't processed",
    )
    // 4 items × 3 votes, all live — no dropped cards
    expect(t.instances).toHaveLength(12)
    expect(t.instances[0].role).toBe('skeptic')
    expect(seg(t.instances[0].receives, 'system')!.text).toContain('vote 1 of 3 on item 1')
    expect(seg(t.instances[0].receives, 'returns')!.shape).toBe('{ refuted, reason } (runtime-enforced)')
  })

  it('renders the verify tick as a parallel swarm in the breakdown', () => {
    expect(r.breakdown).toBe('1 + 12∥ + 4∥')
  })

  it('labels the survivor gap as an upper bound and feeds the fan-out the exact array', () => {
    expect(r.gaps[1].countLabel).toBe('skeptic — ≤ 4 survivors (majority gate)')
    // downstream fan-out iterates the survivors: ≤4 items, exact array — no heuristic split,
    // no truncation note (4 survivors ≤ cap 8)
    const fanoutTick = r.ticks[2]
    expect(fanoutTick.instances).toHaveLength(4)
    expect(fanoutTick.note).toBeUndefined()
    const worker = fanoutTick.instances[0]
    expect(seg(worker.receives, 'item')!.source).toContain('majority-gate survivors (exact array)')
  })
})

describe('rehearse — branches (heterogeneous parallel)', () => {
  const spec: WorkflowSpec = {
    name: 'branches',
    caps: { concurrency: 8, total: 1000 },
    agents: [
      { id: 'set', name: 'setting', model: 'claude-opus-4-8', prompt: 'invent a setting' },
      { id: 'c', name: 'cast', model: 'claude-sonnet-4-6', prompt: 'create the cast' },
      { id: 'w', name: 'world', model: 'claude-haiku-4-5', prompt: 'map the world' },
      { id: 'wr', name: 'writer', model: 'claude-opus-4-8', prompt: 'write it' },
    ],
    root: {
      type: 'sequence',
      steps: [
        { type: 'agent', agent: 'set', id: 'n0' },
        { type: 'branches', branches: ['c', 'w'], id: 'n1', reads: ['n0'] },
        { type: 'agent', agent: 'wr', id: 'n2', reads: ['n1'] },
      ],
    },
  }
  const r = rehearse(spec)

  it('runs every branch in one parallel tick, each with the same reads', () => {
    const t = r.ticks[1]
    expect(t.kind).toBe('branches')
    expect(t.instances.map((i) => i.agentName)).toEqual(['cast', 'world'])
    expect(t.instances.map((i) => i.role)).toEqual(['branch', 'branch'])
    for (const inst of t.instances) {
      expect(seg(inst.receives, 'read')!.memoryName).toBe('setting')
    }
    // each branch's output lands at its own index of the branch-ordered memory
    expect(seg(t.instances[0].receives, 'returns')!.collectedInto).toBe('cast+world[0]')
    expect(r.breakdown).toBe('1 + 2∥ + 1')
    expect(r.gaps[1].countLabel).toBe('cast+world — 2 labeled outputs')
  })

  it('splices a branches memory into a reader as one labeled block per branch', () => {
    const writer = r.ticks[2].instances[0]
    const readSegs = writer.receives.filter((s) => s.kind === 'read')
    expect(readSegs.map((s) => (s as { memoryName: string }).memoryName)).toEqual([
      'cast',
      'world',
    ])
  })
})

describe('rehearse — concurrency queueing (count > concurrency, no drop)', () => {
  const spec: WorkflowSpec = {
    name: 'wide-fanout',
    caps: { concurrency: 8, total: 1000 },
    agents: [{ id: 'w', name: 'worker', model: 'claude-sonnet-4-6', prompt: 'go' }],
    root: { type: 'sequence', steps: [{ type: 'fanout', agent: 'w', cap: 16, id: 'f0' }] },
  }
  const r = rehearse(spec)

  it('seats up to the concurrency cap and queues the rest — nothing dropped', () => {
    const t = r.ticks[0]
    expect(t.instances).toHaveLength(16) // cap 16, all live
    expect(t.seatsUsed).toBe(8)
    expect(t.queued).toBe(8)
    expect(r.breakdown).toBe('16∥')
  })
})

describe('rehearse — honesty about unpinned models (guardrail #5)', () => {
  const spec: WorkflowSpec = {
    name: 'inherit',
    caps: { concurrency: 4, total: 100 },
    agents: [{ id: 'a', name: 'agent', model: 'inherit', prompt: 'do it' }],
    root: { type: 'sequence', steps: [{ type: 'agent', agent: 'a', id: 'n0' }] },
  }
  const r = rehearse(spec)

  it('says the session model is not pinned and never claims enforcement', () => {
    const inst = r.ticks[0].instances[0]
    expect(inst.model).toBe('inherit')
    const sys = seg(inst.receives, 'system')!.text
    expect(sys).toBe('session model — not pinned')
    expect(sys).not.toContain('enforced')
  })
})

describe('rehearse — dangling agent ref does not throw', () => {
  const spec: WorkflowSpec = {
    name: 'ghost',
    caps: { concurrency: 4, total: 100 },
    agents: [],
    root: { type: 'sequence', steps: [{ type: 'agent', agent: 'ghost', id: 'n0' }] },
  }

  it('renders a marked «ref?» instance', () => {
    const r = rehearse(spec)
    const inst = r.ticks[0].instances[0]
    expect(inst.agentName).toBe('«ghost?»')
    expect(inst.model).toBe('inherit')
  })
})

describe('rehearse — nested sequence phase is skipped (no ticks)', () => {
  const spec: WorkflowSpec = {
    name: 'nested',
    caps: { concurrency: 4, total: 100 },
    agents: [{ id: 'a', name: 'agent', model: 'inherit', prompt: 'x' }],
    root: {
      type: 'sequence',
      steps: [
        { type: 'sequence', steps: [{ type: 'agent', agent: 'a' }] },
        { type: 'agent', agent: 'a', id: 'n1' },
      ],
    },
  }

  it('contributes no tick for the nested sequence but keeps the following step', () => {
    const r = rehearse(spec)
    expect(r.ticks).toHaveLength(1)
    expect(r.ticks[0].phaseIndex).toBe(1)
  })
})
