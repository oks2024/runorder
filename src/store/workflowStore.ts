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
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { INHERIT } from '@/lib/models'
import { referencedAgentIds } from '@/lib/nodeRoles'
import { schemaForcible } from '@/emit/plumbing'
import type { PatternKey } from '@/lib/patterns'
import { migrateStorageKey } from '@/io/storage'
import { track } from '@/api/analytics'
import { codeReviewLoop } from '@/spec/seed'
import { workflowSpecSchema } from '@/spec/schema'
import type { Agent, PatternNode, WorkflowInput, WorkflowSpec } from '@/spec/schema'

const CONCURRENCY_MAX = 16
const TOTAL_MAX = 1000
const FANOUT_CAP_MAX = 16
const LOOP_ITER_MAX = 20
const LOOP_ITER_DEFAULT = 3
const ANGLES_MAX = 8
const ANGLES_DEFAULT = 3
const REFINE_ITER_MAX = 10
const REFINE_ITER_DEFAULT = 3
const VOTES_MAX = 8
const VOTES_DEFAULT = 3
const BRANCHES_MAX = 8
const BRANCHES_MIN = 2

/**
 * Fresh-agent role names per pattern — dropping a pattern into the rundown mints one new
 * agent per role (no reuse of `spec.agents[0]`), so every phase is authored in isolation.
 * Names are deduped against the existing roster with `-2`, `-3`, … suffixes.
 */
const ROLE_NAMES: Record<PatternKey, string[]> = {
  step: ['agent'],
  fanout: ['worker'],
  branches: ['branch', 'branch'], // dedupe yields branch, branch-2; addBranch mints more
  loop: ['refiner'],
  mapReduce: ['mapper', 'reducer'],
  adversarial: ['producer', 'critic'],
  refine: ['drafter', 'judge'],
  verify: ['skeptic'],
  multiAngle: ['taker', 'voter'],
  delegate: ['lead', 'helper'],
}

/** Item-fed patterns consume the previous phase's output as their item list (see defaultReadsAt). */
const ITEM_FED: Record<PatternKey, boolean> = {
  step: false,
  fanout: true,
  branches: false,
  loop: false,
  mapReduce: true,
  adversarial: false,
  refine: false,
  verify: true,
  multiAngle: false,
  delegate: false,
}

/** Editable subset of an agent (id is opaque/immutable; never patched). */
export type AgentPatch = Partial<Pick<Agent, 'name' | 'model' | 'prompt'>>

export interface WorkflowState {
  spec: WorkflowSpec

  // --- workflow-level ---
  setName: (name: string) => void
  /** Set or clear the launch input (`args`) declaration; `undefined` removes it. */
  setInput: (input: WorkflowInput | undefined) => void
  setConcurrency: (n: number) => void
  setTotal: (n: number) => void

  // --- agents (roster) ---
  /** Append a new agent (inherit model, empty prompt); returns its generated id. */
  addAgent: () => string
  removeAgent: (id: string) => void
  updateAgent: (id: string, patch: AgentPatch) => void

  // --- composition (flat phase list over root.steps) ---
  /**
   * Insert a fresh phase of `kind` at `index` (clamped to `[0, steps.length]`), minting new
   * agents for its roles (deduped names, inherit model, empty prompt) and default `reads`
   * computed from the phase that will precede it. Returns the new node's id (or '' if root is
   * not a sequence). Replaces the seven append-only `add*` actions.
   */
  insertPattern: (kind: PatternKey, index: number) => string
  removePhase: (index: number) => void
  /** Reorder by swapping with the neighbor in `dir` (-1 up, +1 down); bounds-checked. */
  movePhase: (index: number, dir: -1 | 1) => void
  /** Set the primary agent of a phase (step/fanout/loop body/map/producer/drafter/skeptic/angle). */
  setPhaseAgent: (index: number, agentId: string) => void
  /** Set the secondary agent of a composite phase (reduce/critic/judge/vote/grant target). */
  setPhaseSecondaryAgent: (index: number, agentId: string) => void
  /** Replace a phase's memory reads (ids of earlier phases; validated by validateSpec). */
  setReads: (index: number, reads: string[]) => void
  setFanoutCap: (index: number, cap: number) => void
  setLoopMaxIter: (index: number, maxIter: number) => void
  setMapCap: (index: number, cap: number) => void
  setAngles: (index: number, angles: number) => void
  setGrantCap: (index: number, cap: number) => void
  setRefineMaxIter: (index: number, maxIter: number) => void
  setVerifyVotes: (index: number, votes: number) => void
  setVerifyCap: (index: number, cap: number) => void
  /** Append a fresh branch agent to a branches phase (≤ 8 branches). */
  addBranch: (index: number) => void
  /** Remove one branch of a branches phase (a branches phase keeps ≥ 2). */
  removeBranch: (index: number, branchIndex: number) => void
  /** Retarget one branch of a branches phase to another agent. */
  setBranchAgent: (index: number, branchIndex: number, agentId: string) => void

  // --- workspace ---
  /** Replace the whole spec (deep-cloned). Defaults to a fresh seed. */
  load: (spec?: WorkflowSpec) => void
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'a-' + Math.random().toString(36).slice(2, 10)
}

/**
 * Default `reads` for a phase inserted at `index` — computed from `steps[index - 1]`, the
 * phase that will immediately precede it.
 *
 * Sequential-input kinds read the previous phase (matches the pre-reads behavior, never
 * worse). Item-fed kinds (fan-out / map-reduce) already receive the previous phase through
 * their *items*; they pre-read it only when the previous phase will be schema-forced to
 * `{ context, items }` — then the read splices the cheap shared `context`, not a duplicate
 * of the item list. Reading an array-yielding previous phase would send every worker all
 * of its siblings' inputs, so those default to no reads. Inserting at index 0 (nothing
 * precedes) yields no reads.
 */
function defaultReadsAt(steps: PatternNode[], index: number, itemFed: boolean): string[] {
  const prev = steps[index - 1]
  if (!prev || prev.type === 'sequence' || !prev.id) return []
  if (!itemFed) return [prev.id]
  return schemaForcible(prev) ? [prev.id] : []
}

function clampInt(n: number, min: number, max: number): number | undefined {
  if (!Number.isFinite(n)) return undefined
  return Math.max(min, Math.min(max, Math.round(n)))
}

/** Pick a roster-unique name: `base`, else `base-2`, `base-3`, … */
function dedupeName(base: string, agents: Agent[]): string {
  const taken = new Set(agents.map((a) => a.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/**
 * Build a fresh pattern node from its kind, the ids of its (already-minted) role agents, the
 * concurrency cap (for fan-out/map/grant caps), its default reads, and its node id. Mirrors
 * the numeric defaults the old `add*` factories used.
 */
function buildPatternNode(
  kind: PatternKey,
  agentIds: string[],
  concurrency: number,
  reads: string[],
  id: string,
): PatternNode {
  const cap = clampInt(concurrency, 1, FANOUT_CAP_MAX) ?? 1
  switch (kind) {
    case 'step':
      return { type: 'agent', agent: agentIds[0], id, reads }
    case 'fanout':
      return { type: 'fanout', agent: agentIds[0], cap, id, reads }
    case 'loop':
      return {
        type: 'iterateUntil',
        body: { type: 'agent', agent: agentIds[0] },
        maxIter: LOOP_ITER_DEFAULT,
        id,
        reads,
      }
    case 'mapReduce':
      return {
        type: 'mapReduce',
        map: { agent: agentIds[0], cap },
        reduce: agentIds[1],
        id,
        reads,
      }
    case 'adversarial':
      return { type: 'adversarial', producer: agentIds[0], critic: agentIds[1], id, reads }
    case 'refine':
      return {
        type: 'refine',
        producer: agentIds[0],
        critic: agentIds[1],
        maxIter: REFINE_ITER_DEFAULT,
        id,
        reads,
      }
    case 'verify':
      return { type: 'verify', skeptic: agentIds[0], votes: VOTES_DEFAULT, cap, id, reads }
    case 'branches':
      return { type: 'branches', branches: [...agentIds], id, reads }
    case 'multiAngle':
      return {
        type: 'multiAngle',
        agent: agentIds[0],
        angles: ANGLES_DEFAULT,
        vote: agentIds[1],
        id,
        reads,
      }
    case 'delegate':
      return {
        type: 'agent',
        agent: agentIds[0],
        grants: [{ agent: agentIds[1], cap }],
        id,
        reads,
      }
  }
}

/**
 * Drop `spec.agents` entries no phase references anywhere in the tree.
 *
 * Rationale: the Studio has no roster pane — agents enter *only* via `insertPattern` (one
 * fresh agent per role). An agent no phase points at is therefore invisible and unreachable
 * forever; shipping such ghost entries would violate "the rundown is the spec". So GC runs
 * wherever a reference can be dropped: `removePhase` and the two role setters. (It does NOT
 * run in `addAgent`/`removeAgent`/`updateAgent` — `addAgent` mints an as-yet-unreferenced
 * agent and would be instantly self-defeating; those actions remain for tests/API parity.)
 * GC considers ALL refs, including delegation grants and loop bodies (via referencedAgentIds).
 */
function gcUnreferencedAgents(spec: WorkflowSpec): void {
  const referenced = referencedAgentIds(spec)
  spec.agents = spec.agents.filter((a) => referenced.has(a.id))
}

function clone(spec: WorkflowSpec): WorkflowSpec {
  return structuredClone(spec)
}

/**
 * Adopt a persisted `spec` only if it still parses against the current schema; a corrupt or
 * schema-stale blob falls back to the seed so a bad localStorage payload never bricks the app.
 * Only `spec` is persisted (actions aren't serializable), so we splice it into the live state.
 */
function mergePersisted(persisted: unknown, current: WorkflowState): WorkflowState {
  const spec = (persisted as { spec?: unknown } | undefined)?.spec
  const parsed = workflowSpecSchema.safeParse(spec)
  return parsed.success ? { ...current, spec: parsed.data } : current
}

migrateStorageKey('prewire.live', 'playsheet.live')
migrateStorageKey('playsheet.live', 'runorder.live')

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    immer((set) => ({
    spec: clone(codeReviewLoop),

    setName: (name) =>
      set((s) => {
        s.spec.name = name
      }),

    setInput: (input) =>
      set((s) => {
        // A blank label is invalid per schema (`label` is min(1)); persisting it would make
        // the whole spec fail `mergePersisted`'s parse and silently reset to the seed on the
        // next load. Treat a blank label as "no input" so the live spec stays loadable.
        if (input && input.label.trim()) s.spec.input = input
        else delete s.spec.input
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
      const id = newId()
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

    insertPattern: (kind, index) => {
      const nodeId = newId()
      let ok = false
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const steps = s.spec.root.steps
        const at = Math.max(0, Math.min(index, steps.length))
        // Mint one fresh agent per role, deduping each name against the (growing) roster.
        const agentIds = ROLE_NAMES[kind].map((base) => {
          const id = newId()
          s.spec.agents.push({
            id,
            name: dedupeName(base, s.spec.agents),
            model: INHERIT,
            prompt: '',
          })
          return id
        })
        const reads = defaultReadsAt(steps, at, ITEM_FED[kind])
        steps.splice(at, 0, buildPatternNode(kind, agentIds, s.spec.caps.concurrency, reads, nodeId))
        ok = true
      })
      if (ok) track('pattern_insert', { kind })
      return ok ? nodeId : ''
    },

    setReads: (index, reads) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        if (!node || node.type === 'sequence') return
        node.reads = [...new Set(reads)]
      }),

    // remove/move can leave `reads` dangling or forward — a real, displayable state
    // (surfaced red by validateSpec), same philosophy as dangling agent refs.
    removePhase: (index) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        if (index < 0 || index >= s.spec.root.steps.length) return
        s.spec.root.steps.splice(index, 1)
        gcUnreferencedAgents(s.spec)
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
        else if (node.type === 'adversarial' || node.type === 'refine') node.producer = agentId
        else if (node.type === 'verify') node.skeptic = agentId
        else if (node.type === 'branches' && node.branches.length > 0) node.branches[0] = agentId
        gcUnreferencedAgents(s.spec)
      }),

    setPhaseSecondaryAgent: (index, agentId) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        if (!node) return
        if (node.type === 'mapReduce') node.reduce = agentId
        else if (node.type === 'adversarial' || node.type === 'refine') node.critic = agentId
        else if (node.type === 'multiAngle') node.vote = agentId
        else if (node.type === 'agent' && node.grants?.[0]) node.grants[0].agent = agentId
        gcUnreferencedAgents(s.spec)
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

    setRefineMaxIter: (index, maxIter) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        const v = clampInt(maxIter, 1, REFINE_ITER_MAX)
        if (node?.type === 'refine' && v !== undefined) node.maxIter = v
      }),

    setVerifyVotes: (index, votes) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        const v = clampInt(votes, 1, VOTES_MAX)
        if (node?.type === 'verify' && v !== undefined) node.votes = v
      }),

    setVerifyCap: (index, cap) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        const v = clampInt(cap, 1, FANOUT_CAP_MAX)
        if (node?.type === 'verify' && v !== undefined) node.cap = v
      }),

    addBranch: (index) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        if (node?.type !== 'branches' || node.branches.length >= BRANCHES_MAX) return
        const id = newId()
        s.spec.agents.push({
          id,
          name: dedupeName('branch', s.spec.agents),
          model: INHERIT,
          prompt: '',
        })
        node.branches.push(id)
      }),

    removeBranch: (index, branchIndex) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        if (node?.type !== 'branches' || node.branches.length <= BRANCHES_MIN) return
        if (branchIndex < 0 || branchIndex >= node.branches.length) return
        node.branches.splice(branchIndex, 1)
        gcUnreferencedAgents(s.spec)
      }),

    setBranchAgent: (index, branchIndex, agentId) =>
      set((s) => {
        if (s.spec.root.type !== 'sequence') return
        const node = s.spec.root.steps[index]
        if (node?.type !== 'branches') return
        if (branchIndex < 0 || branchIndex >= node.branches.length) return
        node.branches[branchIndex] = agentId
        gcUnreferencedAgents(s.spec)
      }),

    load: (spec) =>
      set((s) => {
        s.spec = clone(spec ?? codeReviewLoop)
      }),
    })),
    {
      name: 'runorder.live',
      version: 1,
      partialize: (s) => ({ spec: s.spec }),
      merge: mergePersisted,
    },
  ),
)
