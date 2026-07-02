/**
 * Canonical workflow store — the live, editable instance of the spec model.
 *
 * One Zustand store holds a single `WorkflowSpec` (schema.ts), the single source of truth.
 * Immer middleware gives ergonomic nested updates; emitters and the (deferred) graph read
 * the same tree directly. Mockup-7's panes bind their controlled inputs to these actions.
 *
 * The store keeps the model *caps-valid* (clamps to schema bounds), but does NOT prevent
 * dangling refs — removing an agent that phases still point at is a real, displayable state
 * (mockup 7 styles it red). Graph validity is reported separately via `validateSpec`.
 *
 * V1 invariant: `root` is always a `sequence`, and the editor exposes it as a flat ordered
 * phase list where each phase is an `agent` step or a `fanout`. The phase actions operate on
 * `root.steps`; they no-op if the invariant is ever broken.
 */
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { INHERIT } from '@/lib/models'
import { codeReviewLoop } from '@/spec/seed'
import type { Agent, WorkflowSpec } from '@/spec/schema'

const CONCURRENCY_MAX = 16
const TOTAL_MAX = 1000
const FANOUT_CAP_MAX = 16
const LOOP_ITER_MAX = 20
const LOOP_ITER_DEFAULT = 3
const ANGLES_MAX = 8
const ANGLES_DEFAULT = 3

/** Editable subset of an agent (id is opaque/immutable; never patched). */
export type AgentPatch = Partial<Pick<Agent, 'name' | 'model' | 'prompt'>>

export interface WorkflowState {
  spec: WorkflowSpec

  // --- workflow-level ---
  setName: (name: string) => void
  setConcurrency: (n: number) => void
  setTotal: (n: number) => void

  // --- agents (roster) ---
  /** Append a new agent (inherit model, empty prompt); returns its generated id. */
  addAgent: () => string
  removeAgent: (id: string) => void
  updateAgent: (id: string, patch: AgentPatch) => void

  // --- composition (flat phase list over root.steps) ---
  addStep: (agentId?: string) => void
  addFanout: (agentId?: string, cap?: number) => void
  /** Append a loop: one body agent repeated up to `maxIter` (stops early when it reports done). */
  addLoop: (agentId?: string, maxIter?: number) => void
  /** Append a map-reduce: map one agent over prior output (capped), then a reduce agent merges. */
  addMapReduce: (mapAgentId?: string, reduceAgentId?: string, cap?: number) => void
  /** Append an adversarial pair: producer drafts, critic critiques. */
  addAdversarial: (producerId?: string, criticId?: string) => void
  /** Append a multi-angle: one agent from N angles, then a vote agent picks/synthesizes. */
  addMultiAngle: (agentId?: string, voteId?: string, angles?: number) => void
  /** Append an A+ delegate step: a lead agent empowered to delegate to a capped agent. */
  addDelegate: (agentId?: string, grantAgentId?: string, cap?: number) => void
  removePhase: (index: number) => void
  /** Reorder by swapping with the neighbor in `dir` (-1 up, +1 down); bounds-checked. */
  movePhase: (index: number, dir: -1 | 1) => void
  /** Set the primary agent of a phase (step/fanout/loop body/map/producer/angle). */
  setPhaseAgent: (index: number, agentId: string) => void
  /** Set the secondary agent of a composite phase (reduce/critic/vote/grant target). */
  setPhaseSecondaryAgent: (index: number, agentId: string) => void
  setFanoutCap: (index: number, cap: number) => void
  setLoopMaxIter: (index: number, maxIter: number) => void
  setMapCap: (index: number, cap: number) => void
  setAngles: (index: number, angles: number) => void
  setGrantCap: (index: number, cap: number) => void

  // --- workspace ---
  /** Replace the whole spec (deep-cloned). Defaults to a fresh seed. */
  load: (spec?: WorkflowSpec) => void
}

function newAgentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'a-' + Math.random().toString(36).slice(2, 10)
}

function clampInt(n: number, min: number, max: number): number | undefined {
  if (!Number.isFinite(n)) return undefined
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clone(spec: WorkflowSpec): WorkflowSpec {
  return structuredClone(spec)
}

export const useWorkflowStore = create<WorkflowState>()(
  immer((set) => ({
    spec: clone(codeReviewLoop),

    setName: (name) =>
      set((s) => {
        s.spec.name = name
      }),

    setConcurrency: (n) =>
      set((s) => {
        const v = clampInt(n, 1, CONCURRENCY_MAX)
        if (v !== undefined) s.spec.caps.concurrency = v
      }),

    setTotal: (n) =>
      set((s) => {
        const v = clampInt(n, 1, TOTAL_MAX)
        if (v !== undefined) s.spec.caps.total = v
      }),

    addAgent: () => {
      const id = newAgentId()
      set((s) => {
        s.spec.agents.push({
          id,
          name: `agent-${s.spec.agents.length + 1}`,
          model: INHERIT,
          prompt: '',
        })
      })
      return id
    },

    removeAgent: (id) =>
      set((s) => {
        s.spec.agents = s.spec.agents.filter((a) => a.id !== id)
        // Phases still referencing `id` become dangling on purpose — surfaced by validateSpec.
      }),

    updateAgent: (id, patch) =>
      set((s) => {
        const agent = s.spec.agents.find((a) => a.id === id)
        if (!agent) return
        if (patch.name !== undefined) agent.name = patch.name
        if (patch.model !== undefined) agent.model = patch.model
        if (patch.prompt !== undefined) agent.prompt = patch.prompt
      }),

    addStep: (agentId) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        s.spec.root.steps.push({
          type: 'agent',
          agent: agentId ?? s.spec.agents[0]?.id ?? '',
        })
      }),

    addFanout: (agentId, cap) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        s.spec.root.steps.push({
          type: 'fanout',
          agent: agentId ?? s.spec.agents[0]?.id ?? '',
          cap: clampInt(cap ?? s.spec.caps.concurrency, 1, FANOUT_CAP_MAX) ?? 1,
        })
      }),

    addLoop: (agentId, maxIter) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        s.spec.root.steps.push({
          type: 'iterateUntil',
          body: { type: 'agent', agent: agentId ?? s.spec.agents[0]?.id ?? '' },
          maxIter: clampInt(maxIter ?? LOOP_ITER_DEFAULT, 1, LOOP_ITER_MAX) ?? 1,
        })
      }),

    addMapReduce: (mapAgentId, reduceAgentId, cap) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const first = s.spec.agents[0]?.id ?? ''
        const second = s.spec.agents[1]?.id ?? first
        s.spec.root.steps.push({
          type: 'mapReduce',
          map: {
            agent: mapAgentId ?? first,
            cap: clampInt(cap ?? s.spec.caps.concurrency, 1, FANOUT_CAP_MAX) ?? 1,
          },
          reduce: reduceAgentId ?? second,
        })
      }),

    addAdversarial: (producerId, criticId) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const first = s.spec.agents[0]?.id ?? ''
        const second = s.spec.agents[1]?.id ?? first
        s.spec.root.steps.push({
          type: 'adversarial',
          producer: producerId ?? first,
          critic: criticId ?? second,
        })
      }),

    addMultiAngle: (agentId, voteId, angles) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const first = s.spec.agents[0]?.id ?? ''
        const second = s.spec.agents[1]?.id ?? first
        s.spec.root.steps.push({
          type: 'multiAngle',
          agent: agentId ?? first,
          angles: clampInt(angles ?? ANGLES_DEFAULT, 1, ANGLES_MAX) ?? 1,
          vote: voteId ?? second,
        })
      }),

    addDelegate: (agentId, grantAgentId, cap) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const first = s.spec.agents[0]?.id ?? ''
        const second = s.spec.agents[1]?.id ?? first
        s.spec.root.steps.push({
          type: 'agent',
          agent: agentId ?? first,
          grants: [
            {
              agent: grantAgentId ?? second,
              cap: clampInt(cap ?? s.spec.caps.concurrency, 1, FANOUT_CAP_MAX) ?? 1,
            },
          ],
        })
      }),

    removePhase: (index) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        if (index < 0 || index >= s.spec.root.steps.length) return
        s.spec.root.steps.splice(index, 1)
      }),

    movePhase: (index, dir) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const steps = s.spec.root.steps
        const target = index + dir
        if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return
        ;[steps[index], steps[target]] = [steps[target], steps[index]]
      }),

    setPhaseAgent: (index, agentId) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        if (!node) return
        // The "primary" agent role, per pattern.
        if (node.type === 'agent' || node.type === 'fanout' || node.type === 'multiAngle')
          node.agent = agentId
        else if (node.type === 'iterateUntil' && node.body.type === 'agent') node.body.agent = agentId
        else if (node.type === 'mapReduce') node.map.agent = agentId
        else if (node.type === 'adversarial') node.producer = agentId
      }),

    setPhaseSecondaryAgent: (index, agentId) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        if (!node) return
        if (node.type === 'mapReduce') node.reduce = agentId
        else if (node.type === 'adversarial') node.critic = agentId
        else if (node.type === 'multiAngle') node.vote = agentId
        else if (node.type === 'agent' && node.grants?.[0]) node.grants[0].agent = agentId
      }),

    setFanoutCap: (index, cap) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        const v = clampInt(cap, 1, FANOUT_CAP_MAX)
        if (node?.type === 'fanout' && v !== undefined) node.cap = v
      }),

    setLoopMaxIter: (index, maxIter) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        const v = clampInt(maxIter, 1, LOOP_ITER_MAX)
        if (node?.type === 'iterateUntil' && v !== undefined) node.maxIter = v
      }),

    setMapCap: (index, cap) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        const v = clampInt(cap, 1, FANOUT_CAP_MAX)
        if (node?.type === 'mapReduce' && v !== undefined) node.map.cap = v
      }),

    setAngles: (index, angles) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        const v = clampInt(angles, 1, ANGLES_MAX)
        if (node?.type === 'multiAngle' && v !== undefined) node.angles = v
      }),

    setGrantCap: (index, cap) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        const v = clampInt(cap, 1, FANOUT_CAP_MAX)
        if (node?.type === 'agent' && node.grants?.[0] && v !== undefined) node.grants[0].cap = v
      }),

    load: (spec) =>
      set((s) => {
        s.spec = clone(spec ?? codeReviewLoop)
      }),
  })),
)
