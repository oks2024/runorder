import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkflowStore } from './workflowStore'
import { workflowSpecSchema } from '@/spec/schema'
import { validateSpec } from '@/spec/validate'
import { INHERIT } from '@/lib/models'

const store = useWorkflowStore
const spec = () => store.getState().spec
const steps = () => {
  const root = spec().root
  if (root.type !== 'sequence') throw new Error('root is not a sequence')
  return root.steps
}

beforeEach(() => {
  store.getState().load() // fresh seed
})

describe('workflowStore — initial state', () => {
  it('seeds with the code-review-loop spec and it is schema-valid', () => {
    expect(spec().name).toBe('code-review-loop')
    expect(workflowSpecSchema.safeParse(spec()).success).toBe(true)
    expect(validateSpec(spec())).toEqual({ ok: true })
  })

  it('does not share nested references with the imported seed (load deep-clones)', () => {
    store.getState().setName('mutated')
    store.getState().load()
    expect(spec().name).toBe('code-review-loop')
  })
})

describe('workflowStore — workflow-level', () => {
  it('sets the name', () => {
    store.getState().setName('my-flow')
    expect(spec().name).toBe('my-flow')
  })

  it('clamps caps to schema bounds', () => {
    store.getState().setConcurrency(99)
    store.getState().setTotal(99999)
    expect(spec().caps.concurrency).toBe(16)
    expect(spec().caps.total).toBe(1000)
    store.getState().setConcurrency(0)
    expect(spec().caps.concurrency).toBe(1)
  })

  it('ignores non-finite cap input', () => {
    store.getState().setConcurrency(8)
    store.getState().setConcurrency(Number.NaN)
    expect(spec().caps.concurrency).toBe(8)
  })
})

describe('workflowStore — agents', () => {
  it('adds an agent with defaults and returns its id', () => {
    const before = spec().agents.length
    const id = store.getState().addAgent()
    const agent = spec().agents.find((a) => a.id === id)
    expect(spec().agents).toHaveLength(before + 1)
    expect(agent).toMatchObject({ id, model: INHERIT, prompt: '' })
    expect(agent?.name).toBeTruthy()
  })

  it('updates only the patched fields', () => {
    store.getState().updateAgent('reviewer', { model: 'claude-sonnet-4-6' })
    const a = spec().agents.find((x) => x.id === 'reviewer')
    expect(a?.model).toBe('claude-sonnet-4-6')
    expect(a?.name).toBe('reviewer') // untouched
  })

  it('removes an agent, leaving referencing phases dangling (surfaced by validateSpec)', () => {
    store.getState().removeAgent('investigator')
    expect(spec().agents.find((a) => a.id === 'investigator')).toBeUndefined()
    const result = validateSpec(spec())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatchObject({ ref: 'investigator' })
  })
})

describe('workflowStore — composition (phases)', () => {
  it('appends a step and a fanout, each with a generated id', () => {
    const n = steps().length
    store.getState().addStep('reviewer')
    store.getState().addFanout('investigator', 4)
    expect(steps()).toHaveLength(n + 2)
    const a = steps()[n]
    const b = steps()[n + 1]
    expect(a).toMatchObject({ type: 'agent', agent: 'reviewer' })
    expect(b).toMatchObject({ type: 'fanout', agent: 'investigator', cap: 4 })
    const aId = 'id' in a ? a.id : undefined
    const bId = 'id' in b ? b.id : undefined
    expect(aId).toBeTruthy()
    expect(bId).toBeTruthy()
    expect(aId).not.toBe(bId)
  })

  it('defaults reads to the previous phase for a sequential step', () => {
    store.getState().addStep('reviewer')
    const added = steps()[steps().length - 1]
    expect(added.type === 'agent' && added.reads).toEqual(['n-synthesize'])
  })

  it('defaults fanout reads to the previous phase only when it will be schema-forced', () => {
    // previous = synthesizer step (plain agent → will be forced to { context, items })
    store.getState().addFanout('investigator', 4)
    const afterStep = steps()[steps().length - 1]
    expect(afterStep.type === 'fanout' && afterStep.reads).toEqual(['n-synthesize'])
    // previous = that fanout (array output → reading it would duplicate the item list)
    store.getState().addFanout('investigator', 4)
    const afterFanout = steps()[steps().length - 1]
    expect(afterFanout.type === 'fanout' && afterFanout.reads).toEqual([])
  })

  it('setReads replaces a phase reads list and dedupes', () => {
    store.getState().setReads(2, ['n-review', 'n-investigate', 'n-review'])
    const node = steps()[2]
    expect(node.type === 'agent' && node.reads).toEqual(['n-review', 'n-investigate'])
    expect(validateSpec(spec())).toEqual({ ok: true })
  })

  it('removePhase leaves reads dangling on purpose (surfaced by validateSpec)', () => {
    store.getState().removePhase(0) // fanout still reads n-review
    const result = validateSpec(spec())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatchObject({ code: 'dangling-read', ref: 'n-review' })
  })

  it('clamps a fanout cap on add and on set', () => {
    store.getState().addFanout('investigator', 999)
    const idx = steps().length - 1
    expect((steps()[idx] as { cap: number }).cap).toBe(16)
    store.getState().setFanoutCap(idx, 2)
    expect((steps()[idx] as { cap: number }).cap).toBe(2)
  })

  it('removes a phase by index', () => {
    const n = steps().length
    store.getState().removePhase(0)
    expect(steps()).toHaveLength(n - 1)
    expect(steps()[0]).toMatchObject({ type: 'fanout', agent: 'investigator', cap: 8 })
  })

  it('moves a phase and respects bounds', () => {
    // seed: [reviewer step, investigator fanout, synthesizer step]
    store.getState().movePhase(0, 1)
    expect(steps()[0]).toMatchObject({ type: 'fanout', agent: 'investigator' })
    expect(steps()[1]).toMatchObject({ type: 'agent', agent: 'reviewer' })
    // out-of-bounds is a no-op
    store.getState().movePhase(0, -1)
    expect(steps()[0]).toMatchObject({ type: 'fanout', agent: 'investigator' })
  })

  it('retargets a phase agent', () => {
    store.getState().setPhaseAgent(0, 'synthesizer')
    expect(steps()[0]).toMatchObject({ type: 'agent', agent: 'synthesizer' })
  })

  it('setFanoutCap is a no-op on a non-fanout phase', () => {
    store.getState().setFanoutCap(0, 5) // phase 0 is a step
    expect(steps()[0]).toMatchObject({ type: 'agent', agent: 'reviewer' })
  })

  it('appends a loop with a single-agent body and default maxIter', () => {
    const n = steps().length
    store.getState().addLoop('reviewer')
    expect(steps()).toHaveLength(n + 1)
    expect(steps()[n]).toMatchObject({
      type: 'iterateUntil',
      body: { type: 'agent', agent: 'reviewer' },
      maxIter: 3,
    })
  })

  it('clamps a loop maxIter on add and on set', () => {
    store.getState().addLoop('reviewer', 999)
    const idx = steps().length - 1
    expect((steps()[idx] as { maxIter: number }).maxIter).toBe(20)
    store.getState().setLoopMaxIter(idx, 5)
    expect((steps()[idx] as { maxIter: number }).maxIter).toBe(5)
  })

  it('retargets a loop agent via its body', () => {
    store.getState().addLoop('reviewer')
    const idx = steps().length - 1
    store.getState().setPhaseAgent(idx, 'synthesizer')
    expect(steps()[idx]).toMatchObject({
      type: 'iterateUntil',
      body: { type: 'agent', agent: 'synthesizer' },
      maxIter: 3,
    })
  })

  it('keeps the spec schema-valid after adding a loop', () => {
    store.getState().addLoop('reviewer')
    expect(workflowSpecSchema.safeParse(spec()).success).toBe(true)
  })

  it('appends map-reduce / adversarial / multi-angle / delegate, all schema-valid', () => {
    store.getState().addMapReduce('investigator', 'synthesizer', 6)
    store.getState().addAdversarial('reviewer', 'investigator')
    store.getState().addMultiAngle('reviewer', 'synthesizer', 4)
    store.getState().addDelegate('reviewer', 'investigator', 5)
    const s = steps()
    expect(s[s.length - 4]).toMatchObject({
      type: 'mapReduce',
      map: { agent: 'investigator', cap: 6 },
      reduce: 'synthesizer',
    })
    expect(s[s.length - 3]).toMatchObject({ type: 'adversarial', producer: 'reviewer', critic: 'investigator' })
    expect(s[s.length - 2]).toMatchObject({
      type: 'multiAngle',
      agent: 'reviewer',
      angles: 4,
      vote: 'synthesizer',
    })
    expect(s[s.length - 1]).toMatchObject({
      type: 'agent',
      agent: 'reviewer',
      grants: [{ agent: 'investigator', cap: 5 }],
    })
    expect(workflowSpecSchema.safeParse(spec()).success).toBe(true)
  })

  it('routes primary/secondary agent setters per pattern', () => {
    store.getState().addMapReduce('reviewer', 'synthesizer', 4)
    const idx = steps().length - 1
    store.getState().setPhaseAgent(idx, 'investigator') // primary = map agent
    store.getState().setPhaseSecondaryAgent(idx, 'reviewer') // secondary = reduce
    expect(steps()[idx]).toMatchObject({
      type: 'mapReduce',
      map: { agent: 'investigator', cap: 4 },
      reduce: 'reviewer',
    })
  })

  it('clamps map cap, angles, and grant cap', () => {
    store.getState().addMapReduce('reviewer', 'synthesizer', 999)
    store.getState().addMultiAngle('reviewer', 'synthesizer', 999)
    store.getState().addDelegate('reviewer', 'investigator', 999)
    const [mr, ma, dg] = steps().slice(-3)
    expect((mr as { map: { cap: number } }).map.cap).toBe(16)
    expect((ma as { angles: number }).angles).toBe(8)
    expect((dg as { grants: { cap: number }[] }).grants[0].cap).toBe(16)
  })
})
