import { describe, it, expect } from 'vitest'
import { emitScript, emitScriptLines } from './scriptEmitter'
import { PROV_CAPS, PROV_NAME, provKey, type ProvField } from '@/lib/prov'
import { isSchemaForced } from './plumbing'
import { codeReviewLoop } from '@/spec/seed'
import type { PatternNode, WorkflowSpec } from '@/spec/schema'

/**
 * An all-seven-patterns spec, hand-built with stable node ids so provenance can be asserted.
 * Each phase reads the one before it, so the reads-splice tags are exercised too; the opener
 * step feeds the fan-out, so it is schema-forced (exercises the step `schema` tag).
 */
const allPatterns: WorkflowSpec = {
  name: 'all-patterns',
  caps: { concurrency: 8, total: 500 },
  agents: [
    { id: 'opener', name: 'opener', model: 'opus', prompt: 'open it' },
    { id: 'worker', name: 'worker', model: 'sonnet', prompt: 'work an item' },
    { id: 'refiner', name: 'refiner', model: 'haiku', prompt: 'refine' },
    { id: 'mapper', name: 'mapper', model: 'sonnet', prompt: 'map it' },
    { id: 'reducer', name: 'reducer', model: 'opus', prompt: 'reduce it' },
    { id: 'producer', name: 'producer', model: 'opus', prompt: 'make it' },
    { id: 'critic', name: 'critic', model: 'sonnet', prompt: 'break it' },
    { id: 'taker', name: 'taker', model: 'sonnet', prompt: 'consider' },
    { id: 'voter', name: 'voter', model: 'opus', prompt: 'pick best' },
    { id: 'lead', name: 'lead', model: 'opus', prompt: 'lead it' },
    { id: 'helper', name: 'helper', model: 'sonnet', prompt: 'help' },
  ],
  root: {
    type: 'sequence',
    steps: [
      { type: 'agent', agent: 'opener', id: 's1' },
      { type: 'fanout', agent: 'worker', cap: 6, id: 's2', reads: ['s1'] },
      { type: 'iterateUntil', body: { type: 'agent', agent: 'refiner' }, maxIter: 4, id: 's3', reads: ['s2'] },
      { type: 'mapReduce', map: { agent: 'mapper', cap: 5 }, reduce: 'reducer', id: 's4', reads: ['s3'] },
      { type: 'adversarial', producer: 'producer', critic: 'critic', id: 's5', reads: ['s4'] },
      { type: 'multiAngle', agent: 'taker', angles: 3, vote: 'voter', id: 's6', reads: ['s5'] },
      { type: 'agent', agent: 'lead', grants: [{ agent: 'helper', cap: 4 }], id: 's7', reads: ['s6'] },
    ],
  },
}

/** Required prov fields per phase kind, given the node (some fields are conditional). */
function requiredFields(node: PatternNode, forced: boolean): ProvField[] {
  const reads = 'reads' in node && node.reads && node.reads.length ? (['reads'] as ProvField[]) : []
  switch (node.type) {
    case 'agent':
      return node.grants && node.grants.length
        ? ['model', 'prompt', 'schema', 'grant-cap', 'model2', 'prompt2', ...reads]
        : ['model', 'prompt', ...(forced ? (['schema'] as ProvField[]) : []), ...reads]
    case 'fanout':
      return ['model', 'prompt', 'cap', ...reads]
    case 'iterateUntil':
      return ['model', 'prompt', 'iters', ...reads]
    case 'mapReduce':
      return ['model', 'prompt', 'cap', 'model2', 'prompt2', ...reads]
    case 'adversarial':
      return ['model', 'prompt', 'model2', 'prompt2', ...reads]
    case 'multiAngle':
      return ['model', 'prompt', 'angles', 'model2', 'prompt2', ...(forced ? (['schema'] as ProvField[]) : []), ...reads]
    default:
      return []
  }
}

describe('emitScriptLines — provenance line records', () => {
  it('join identity: seed lines re-join to the emitted script byte-for-byte', () => {
    const joined = emitScriptLines(codeReviewLoop)
      .map((l) => l.text)
      .join('\n')
    expect(joined).toBe(emitScript(codeReviewLoop))
  })

  it('join identity: all-patterns lines re-join to the emitted script byte-for-byte', () => {
    const joined = emitScriptLines(allPatterns)
      .map((l) => l.text)
      .join('\n')
    expect(joined).toBe(emitScript(allPatterns))
  })

  it('no EmitLine.text ever contains a newline', () => {
    for (const spec of [codeReviewLoop, allPatterns]) {
      for (const line of emitScriptLines(spec)) {
        expect(line.text).not.toContain('\n')
      }
    }
  })

  it('tags PROV_NAME and PROV_CAPS at least once each', () => {
    const keys = new Set(emitScriptLines(codeReviewLoop).flatMap((l) => l.prov ?? []))
    expect(keys.has(PROV_NAME)).toBe(true)
    expect(keys.has(PROV_CAPS)).toBe(true)
  })

  it('covers every editable field of every pattern with ≥1 tagged line', () => {
    const lines = emitScriptLines(allPatterns)
    const keys = new Set(lines.flatMap((l) => l.prov ?? []))
    const steps = (allPatterns.root as { steps: PatternNode[] }).steps
    steps.forEach((node, i) => {
      const id = 'id' in node ? node.id : undefined
      expect(id).toBeTruthy()
      const forced = isSchemaForced(steps, i)
      for (const field of requiredFields(node, forced)) {
        expect(keys.has(provKey(id as string, field))).toBe(true)
      }
    })
  })

  it('sets phaseIndex on every body line and only on body lines', () => {
    const lines = emitScriptLines(codeReviewLoop)
    const firstPhase = lines.findIndex((l) => l.text.startsWith('phase('))
    const retIdx = lines.findIndex((l) => l.text.startsWith('return '))
    lines.forEach((l, i) => {
      const inBody = i >= firstPhase && i < retIdx && l.text !== ''
      if (inBody) expect(l.phaseIndex).toBeTypeOf('number')
      else expect(l.phaseIndex).toBeUndefined()
    })
  })

  it('assigns each phase-body line the right phaseIndex (seed has 3 phases)', () => {
    const lines = emitScriptLines(codeReviewLoop)
    // The `phase("Phase N")` markers carry the 0-based index N-1.
    expect(lines.find((l) => l.text === 'phase("Phase 1")')?.phaseIndex).toBe(0)
    expect(lines.find((l) => l.text === 'phase("Phase 2")')?.phaseIndex).toBe(1)
    expect(lines.find((l) => l.text === 'phase("Phase 3")')?.phaseIndex).toBe(2)
    // The reviewer prompt line belongs to phase 1.
    const promptLine = lines.find((l) => l.text.includes('p4 describe -S'))
    expect(promptLine?.phaseIndex).toBe(0)
    // All 7 phase indices are present for the all-patterns spec.
    const idxs = new Set(
      emitScriptLines(allPatterns)
        .map((l) => l.phaseIndex)
        .filter((n): n is number => n !== undefined),
    )
    expect([...idxs].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('tag honesty: the line tagged <phase-1 model> actually names its model', () => {
    const lines = emitScriptLines(codeReviewLoop)
    const key = provKey('n-review', 'model')
    const tagged = lines.filter((l) => l.prov?.includes(key))
    expect(tagged.length).toBeGreaterThan(0)
    expect(tagged.some((l) => l.text.includes('claude-opus-4-8'))).toBe(true)
  })
})
