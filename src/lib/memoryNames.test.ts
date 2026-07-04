import { describe, it, expect } from 'vitest'
import { branchLabels, deriveMemoryNames, memoryIndex } from './memoryNames'
import { codeReviewLoop } from '@/spec/seed'
import type { WorkflowSpec } from '@/spec/schema'

describe('deriveMemoryNames', () => {
  it('names each phase after the agent whose output the phase yields', () => {
    expect(deriveMemoryNames(codeReviewLoop)).toEqual([
      { nodeId: 'n-review', name: 'reviewer' },
      { nodeId: 'n-investigate', name: 'investigator' },
      { nodeId: 'n-synthesize', name: 'synthesizer' },
    ])
  })

  it('slugs display names and dedupes repeats in phase order', () => {
    const spec: WorkflowSpec = {
      name: 'x',
      caps: { concurrency: 4, total: 100 },
      agents: [{ id: 'a', name: 'Character creator', model: 'inherit', prompt: '' }],
      root: {
        type: 'sequence',
        steps: [
          { type: 'agent', agent: 'a', id: 'n1' },
          { type: 'agent', agent: 'a', id: 'n2' },
        ],
      },
    }
    expect(deriveMemoryNames(spec).map((e) => e.name)).toEqual([
      'character-creator',
      'character-creator-2',
    ])
  })

  it('uses the output-describing agent per pattern (reduce / vote / grantee)', () => {
    const spec: WorkflowSpec = {
      name: 'x',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'm', name: 'mapper', model: 'inherit', prompt: '' },
        { id: 'r', name: 'reducer', model: 'inherit', prompt: '' },
        { id: 'v', name: 'voter', model: 'inherit', prompt: '' },
        { id: 'g', name: 'grantee', model: 'inherit', prompt: '' },
      ],
      root: {
        type: 'sequence',
        steps: [
          { type: 'mapReduce', map: { agent: 'm', cap: 4 }, reduce: 'r', id: 'n1' },
          { type: 'multiAngle', agent: 'm', angles: 3, vote: 'v', id: 'n2' },
          { type: 'agent', agent: 'm', grants: [{ agent: 'g', cap: 4 }], id: 'n3' },
        ],
      },
    }
    expect(deriveMemoryNames(spec).map((e) => e.name)).toEqual(['reducer', 'voter', 'grantee'])
  })

  it('names a branches phase after every branch, joined in branch order', () => {
    const spec: WorkflowSpec = {
      name: 'x',
      caps: { concurrency: 4, total: 100 },
      agents: [
        { id: 'c', name: 'Cast', model: 'inherit', prompt: '' },
        { id: 'w', name: 'World', model: 'inherit', prompt: '' },
      ],
      root: {
        type: 'sequence',
        steps: [{ type: 'branches', branches: ['c', 'w'], id: 'n1' }],
      },
    }
    expect(deriveMemoryNames(spec)).toEqual([{ nodeId: 'n1', name: 'cast+world' }])
  })

  it('branchLabels slugs each branch and falls back per dangling branch', () => {
    const spec: WorkflowSpec = {
      name: 'x',
      caps: { concurrency: 4, total: 100 },
      agents: [{ id: 'c', name: 'Cast Maker', model: 'inherit', prompt: '' }],
      root: { type: 'sequence', steps: [] },
    }
    expect(branchLabels(spec, { type: 'branches', branches: ['c', 'ghost'], id: 'n1' })).toEqual([
      'cast-maker',
      'branch-2',
    ])
  })

  it('falls back to phase-N for dangling refs and carries undefined ids through', () => {
    const spec: WorkflowSpec = {
      name: 'x',
      caps: { concurrency: 4, total: 100 },
      agents: [],
      root: { type: 'sequence', steps: [{ type: 'agent', agent: 'ghost' }] },
    }
    expect(deriveMemoryNames(spec)).toEqual([{ nodeId: undefined, name: 'phase-1' }])
  })
})

describe('memoryIndex', () => {
  it('maps node ids to their name and phase index, skipping id-less nodes', () => {
    const idx = memoryIndex(codeReviewLoop)
    expect(idx.get('n-review')).toEqual({ name: 'reviewer', index: 0 })
    expect(idx.get('n-synthesize')).toEqual({ name: 'synthesizer', index: 2 })
  })
})
