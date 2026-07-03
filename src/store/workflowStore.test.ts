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

describe('workflowStore — insertPattern', () => {
  const agentByName = (name: string) => spec().agents.find((a) => a.name === name)

  it('splices at end, middle, and 0; returns the node id; ids are unique', () => {
    const n = steps().length // seed = 3
    const endId = store.getState().insertPattern('step', n)
    expect(steps()).toHaveLength(n + 1)
    expect('id' in steps()[n] && (steps()[n] as { id: string }).id).toBe(endId)

    const midId = store.getState().insertPattern('step', 1)
    expect('id' in steps()[1] && (steps()[1] as { id: string }).id).toBe(midId)
    expect(steps()).toHaveLength(n + 2)

    const frontId = store.getState().insertPattern('step', 0)
    expect('id' in steps()[0] && (steps()[0] as { id: string }).id).toBe(frontId)
    expect(new Set([endId, midId, frontId]).size).toBe(3)
    expect([endId, midId, frontId].every(Boolean)).toBe(true)
  })

  it('clamps an out-of-range index into [0, length]', () => {
    const n = steps().length
    const id = store.getState().insertPattern('step', 999)
    expect('id' in steps()[n] && (steps()[n] as { id: string }).id).toBe(id) // appended at end
    const id0 = store.getState().insertPattern('step', -5)
    expect('id' in steps()[0] && (steps()[0] as { id: string }).id).toBe(id0) // clamped to front
  })

  it('mints fresh agents per role (inherit model, empty prompt) with the role names', () => {
    const before = spec().agents.length
    store.getState().insertPattern('mapReduce', steps().length)
    expect(spec().agents).toHaveLength(before + 2)
    expect(agentByName('mapper')).toMatchObject({ model: INHERIT, prompt: '' })
    expect(agentByName('reducer')).toMatchObject({ model: INHERIT, prompt: '' })
    const node = steps()[steps().length - 1]
    expect(node).toMatchObject({
      type: 'mapReduce',
      map: { agent: agentByName('mapper')!.id },
      reduce: agentByName('reducer')!.id,
    })
  })

  it('dedupes fresh agent names against the roster (worker, worker-2)', () => {
    store.getState().insertPattern('fanout', steps().length)
    store.getState().insertPattern('fanout', steps().length)
    const workers = spec().agents.filter((a) => a.name === 'worker' || a.name === 'worker-2')
    expect(workers.map((a) => a.name).sort()).toEqual(['worker', 'worker-2'])
  })

  it('applies the pattern numeric defaults (cap = concurrency, maxIter 3, angles 3, grant cap)', () => {
    expect(spec().caps.concurrency).toBe(8)
    store.getState().insertPattern('fanout', steps().length)
    store.getState().insertPattern('loop', steps().length)
    store.getState().insertPattern('multiAngle', steps().length)
    store.getState().insertPattern('mapReduce', steps().length)
    store.getState().insertPattern('delegate', steps().length)
    const s = steps()
    const [fo, lp, ma, mr, dg] = s.slice(-5)
    expect((fo as { cap: number }).cap).toBe(8)
    expect((lp as { maxIter: number }).maxIter).toBe(3)
    expect((ma as { angles: number }).angles).toBe(3)
    expect((mr as { map: { cap: number } }).map.cap).toBe(8)
    expect((dg as { grants: { cap: number }[] }).grants[0].cap).toBe(8)
    expect(workflowSpecSchema.safeParse(spec()).success).toBe(true)
  })

  it('builds every pattern schema-valid', () => {
    ;(['step', 'fanout', 'loop', 'mapReduce', 'adversarial', 'multiAngle', 'delegate'] as const).forEach(
      (k) => store.getState().insertPattern(k, steps().length),
    )
    expect(workflowSpecSchema.safeParse(spec()).success).toBe(true)
  })

  describe('defaultReadsAt', () => {
    it('reads the schema-forcible previous phase for both item-fed and sequential kinds', () => {
      // insert after the synthesizer step (n-synthesize: plain agent → schema-forcible)
      store.getState().insertPattern('step', 3)
      const stepNode = steps()[3]
      expect(stepNode.type === 'agent' && stepNode.reads).toEqual(['n-synthesize'])

      store.getState().load() // reset
      store.getState().insertPattern('fanout', 3)
      const fanoutNode = steps()[3]
      expect(fanoutNode.type === 'fanout' && fanoutNode.reads).toEqual(['n-synthesize'])
    })

    it('an item-fed kind after an array-yielding phase reads nothing; a sequential kind still reads it', () => {
      // insert after the fan-out (n-investigate: array output, not schema-forcible)
      store.getState().insertPattern('fanout', 2)
      const itemFed = steps()[2]
      expect(itemFed.type === 'fanout' && itemFed.reads).toEqual([])

      store.getState().load()
      store.getState().insertPattern('step', 2)
      const sequential = steps()[2]
      expect(sequential.type === 'agent' && sequential.reads).toEqual(['n-investigate'])
    })

    it('inserting at 0 (nothing precedes) yields no reads', () => {
      store.getState().insertPattern('step', 0)
      const node = steps()[0]
      expect(node.type === 'agent' && node.reads).toEqual([])
    })
  })

  it('routes primary/secondary agent setters per pattern', () => {
    store.getState().insertPattern('mapReduce', steps().length)
    const idx = steps().length - 1
    store.getState().setPhaseAgent(idx, 'reviewer') // primary = map agent
    store.getState().setPhaseSecondaryAgent(idx, 'synthesizer') // secondary = reduce
    expect(steps()[idx]).toMatchObject({
      type: 'mapReduce',
      map: { agent: 'reviewer' },
      reduce: 'synthesizer',
    })
  })
})

describe('workflowStore — garbage collection of unreferenced agents', () => {
  it('removePhase drops the fresh agents the removed phase alone referenced', () => {
    const before = spec().agents.length
    store.getState().insertPattern('mapReduce', steps().length) // +mapper +reducer
    expect(spec().agents).toHaveLength(before + 2)
    store.getState().removePhase(steps().length - 1)
    expect(spec().agents).toHaveLength(before)
    expect(spec().agents.find((a) => a.name === 'mapper')).toBeUndefined()
    expect(spec().agents.find((a) => a.name === 'reducer')).toBeUndefined()
  })

  it('retargeting a role via setPhaseAgent GCs the orphaned fresh agent', () => {
    store.getState().insertPattern('step', steps().length) // fresh "agent"
    const idx = steps().length - 1
    const orphanId = spec().agents.find((a) => a.name === 'agent')!.id
    store.getState().setPhaseAgent(idx, 'reviewer')
    expect(spec().agents.find((a) => a.id === orphanId)).toBeUndefined()
  })

  it('keeps an agent referenced by another phase alive when one phase retargets away', () => {
    // reviewer is referenced by phase 0; point phase 2 at it too, then retarget phase 2 back
    store.getState().setPhaseAgent(2, 'reviewer') // synthesizer now orphaned → GC'd
    expect(spec().agents.find((a) => a.name === 'reviewer')).toBeDefined()
    expect(spec().agents.find((a) => a.name === 'synthesizer')).toBeUndefined()
    // reviewer still referenced by phase 0, so retargeting phase 2 does not remove it
    store.getState().setPhaseAgent(2, 'investigator')
    expect(spec().agents.find((a) => a.name === 'reviewer')).toBeDefined()
  })

  it('keeps a delegation grantee alive (GC considers grants)', () => {
    store.getState().insertPattern('delegate', steps().length) // lead + helper (grant)
    const helper = spec().agents.find((a) => a.name === 'helper')
    expect(helper).toBeDefined()
    // touch an unrelated phase to trigger GC; the grantee must survive
    store.getState().setPhaseAgent(0, 'reviewer')
    expect(spec().agents.find((a) => a.name === 'helper')).toBeDefined()
  })

  it('removePhase still leaves dangling READS (not agents) on purpose', () => {
    store.getState().removePhase(0) // fanout still reads n-review (a node id, not an agent)
    const result = validateSpec(spec())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toMatchObject({ code: 'dangling-read', ref: 'n-review' })
  })
})

describe('workflowStore — phase editing', () => {
  it('setReads replaces a phase reads list and dedupes', () => {
    store.getState().setReads(2, ['n-review', 'n-investigate', 'n-review'])
    const node = steps()[2]
    expect(node.type === 'agent' && node.reads).toEqual(['n-review', 'n-investigate'])
    expect(validateSpec(spec())).toEqual({ ok: true })
  })

  it('clamps a fanout cap on set', () => {
    store.getState().setFanoutCap(1, 999) // phase 1 is the seed fanout
    expect((steps()[1] as { cap: number }).cap).toBe(16)
    store.getState().setFanoutCap(1, 2)
    expect((steps()[1] as { cap: number }).cap).toBe(2)
  })

  it('removes a phase by index', () => {
    const n = steps().length
    store.getState().removePhase(2) // drop the synthesizer step (its dangling read is gone too)
    expect(steps()).toHaveLength(n - 1)
    expect(steps()[0]).toMatchObject({ type: 'agent', agent: 'reviewer' })
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

  it('clamps a loop maxIter on set', () => {
    store.getState().insertPattern('loop', steps().length)
    const idx = steps().length - 1
    store.getState().setLoopMaxIter(idx, 999)
    expect((steps()[idx] as { maxIter: number }).maxIter).toBe(20)
    store.getState().setLoopMaxIter(idx, 5)
    expect((steps()[idx] as { maxIter: number }).maxIter).toBe(5)
  })

  it('retargets a loop agent via its body', () => {
    store.getState().insertPattern('loop', steps().length)
    const idx = steps().length - 1
    store.getState().setPhaseAgent(idx, 'synthesizer')
    expect(steps()[idx]).toMatchObject({
      type: 'iterateUntil',
      body: { type: 'agent', agent: 'synthesizer' },
    })
  })

  it('clamps map cap, angles, and grant cap on set', () => {
    store.getState().insertPattern('mapReduce', steps().length)
    store.getState().insertPattern('multiAngle', steps().length)
    store.getState().insertPattern('delegate', steps().length)
    const [mrIdx, maIdx, dgIdx] = [steps().length - 3, steps().length - 2, steps().length - 1]
    store.getState().setMapCap(mrIdx, 999)
    store.getState().setAngles(maIdx, 999)
    store.getState().setGrantCap(dgIdx, 999)
    expect((steps()[mrIdx] as { map: { cap: number } }).map.cap).toBe(16)
    expect((steps()[maIdx] as { angles: number }).angles).toBe(8)
    expect((steps()[dgIdx] as { grants: { cap: number }[] }).grants[0].cap).toBe(16)
  })
})
