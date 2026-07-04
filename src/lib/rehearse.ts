/**
 * Rehearsal derivation — a truthful, read-only dry-run of what the emitted script does.
 *
 * The Studio "Rehearsal" view instantiates the spec at a sample fan-out size N and shows,
 * tick by tick, exactly which agents run, how many seats they take against the concurrency
 * cap, which items get dropped by an in-script cap, and — for one worker — the fully
 * assembled input it receives. This module is that view's data model: a pure, deterministic
 * projection of a `WorkflowSpec` + a sample size.
 *
 * It MUST mirror `emit/scriptEmitter.ts` exactly (guardrail #5 — never claim behavior the
 * script doesn't produce):
 *   - Item counts propagate like the emitter's `itemsExpr`: the first materialized item list
 *     (workflow args, or a schema-forced `{ context, items }` producer, or a heuristic split)
 *     has `sampleN` entries; a fan-out/delegate's *output* array carries its live (kept)
 *     instance count downstream.
 *   - A fan-out / map / grantee swarm is sliced to its cap in-script, so items beyond the cap
 *     are genuinely *dropped* (shown, but not counted toward seats/totals).
 *   - `reads` splice into every agent of a phase (both stages of a composite) EXCEPT delegate
 *     grantees, which instead receive the lead's intra-phase `context`.
 *   - Only runtime-enforced facts are marked "enforced": a pinned model; an `inherit` model is
 *     explicitly "not pinned". Caps/iters/angles are literal in-script (bounds, shown as such).
 *
 * Nothing here reads the clock or randomness — same spec + N ⇒ same rehearsal.
 */
import { INHERIT, resolveAlias } from '@/lib/models'
import { branchLabels, deriveMemoryNames } from '@/lib/memoryNames'
import { isSchemaForced, yieldsItemArray } from '@/emit/plumbing'
import type { PatternKey } from '@/lib/patterns'
import type { PatternNode, WorkflowSpec } from '@/spec/schema'

/** One labeled block of a worker's fully-assembled input (see the anatomy card). */
export type ReceiveSegment =
  /** Runtime-enforced / structural facts only: the pinned (or not-pinned) model, a granted
   *  seat, an intra-phase merge note. The text itself carries the honesty ("· enforced" vs
   *  "not pinned") — a segment never asserts enforcement the script doesn't inject. */
  | { kind: 'system'; text: string }
  /** A named memory this phase reads, spliced as a labeled `[name]` block. */
  | { kind: 'read'; memoryName: string; fromAgent: string; placeholder: string; source: string }
  /** This swarm worker's one assigned item, with 1-based position and its exact provenance. */
  | { kind: 'item'; index: number; total: number; source: string; placeholder: string }
  /** The agent's real prompt text (or a marked placeholder when empty). */
  | { kind: 'prompt'; text: string }
  /** The return shape the runtime expects, and where the output is collected. */
  | { kind: 'returns'; shape: string; collectedInto: string }

export type InstanceRole =
  | 'solo'
  | 'worker'
  | 'mapper'
  | 'reducer'
  | 'producer'
  | 'critic'
  | 'skeptic'
  | 'take'
  | 'voter'
  | 'lead'
  | 'grantee'
  | 'loop-body'
  | 'branch'

export interface RehearsalInstance {
  /** Resolved agent name; a dangling ref becomes `«ref?»`. */
  agentName: string
  /** Resolved model id (`resolveAlias`), or `inherit` when unpinned / dangling. */
  model: string
  role: InstanceRole
  /** 1-based worker/take number within a swarm; undefined for singletons. */
  n?: number
  /** Beyond the in-script slice cap — shown, but never runs (empty `receives`). */
  dropped: boolean
  receives: ReceiveSegment[]
}

export interface RehearsalTick {
  /** `T1`, `T2`, … */
  label: string
  /** 0-based index into the root phase list. */
  phaseIndex: number
  nodeId?: string
  kind: PatternKey
  /** Sub-stage of a 2-tick phase. */
  stage?: 'map' | 'reduce' | 'draft' | 'critique' | 'judge' | 'takes' | 'vote' | 'lead' | 'delegates'
  /** Extra context (e.g. the loop's bounded/sequential caveat). */
  note?: string
  instances: RehearsalInstance[]
  /** Live instances actually seated this tick = min(live count, concurrency). */
  seatsUsed: number
  /** Live instances beyond the concurrency cap — they wait (NOT dropped). */
  queued: number
}

export interface RehearsalGap {
  /** Index into `ticks` after which this handoff label renders. */
  afterTickIndex: number
  memoryName: string
  countLabel: string
}

export interface CapWarning {
  phaseIndex: number
  nodeId?: string
  kind: 'fanout' | 'mapReduce' | 'delegate' | 'verify'
  cap: number
  incoming: number
  dropped: number
}

export interface Rehearsal {
  ticks: RehearsalTick[]
  gaps: RehearsalGap[]
  /** Live (non-dropped) instances summed; a loop counts once (its bound is in the note). */
  totalAgents: number
  /** Max `seatsUsed` across ticks. */
  peakSeats: number
  /** Per-tick live counts joined by " + ", parallel swarm ticks marked `N∥` (e.g. "1 + 8∥ + 1"). */
  breakdown: string
  capWarnings: CapWarning[]
}

// --- small pure helpers ------------------------------------------------------------------

/** The agent ref whose output *is* this phase's memory (mirrors memoryNames' output rule). */
function outputAgentRef(node: PatternNode): string | null {
  switch (node.type) {
    case 'agent':
      return node.grants && node.grants[0] ? node.grants[0].agent : node.agent
    case 'fanout':
      return node.agent
    case 'mapReduce':
      return node.reduce
    case 'adversarial':
      return node.producer
    case 'refine':
      return node.producer
    case 'verify':
      return node.skeptic
    case 'multiAngle':
      return node.vote
    case 'iterateUntil':
      return node.body.type === 'agent' ? node.body.agent : null
    default:
      return null
  }
}

/** Does this tick fan work out via `parallel()` (so its count renders `N∥`)? */
function isParallelTick(t: RehearsalTick): boolean {
  return (
    t.kind === 'fanout' ||
    t.kind === 'verify' ||
    t.kind === 'branches' ||
    (t.kind === 'mapReduce' && t.stage === 'map') ||
    (t.kind === 'multiAngle' && t.stage === 'takes') ||
    (t.kind === 'delegate' && t.stage === 'delegates')
  )
}

function readPlaceholder(fromAgent: string): string {
  return `(sample) shared context from ${fromAgent} — real content exists only at run time`
}

function itemSeg(index: number, total: number, source: string): ReceiveSegment {
  return {
    kind: 'item',
    index,
    total,
    source,
    placeholder: `(sample) work item ${index} of ${total} — real content exists only at run time`,
  }
}

const CONTEXT_ITEMS_SHAPE = '{ context, items } (runtime-enforced)'
const LOOP_SHAPE = '{ done, output } (runtime-enforced)'
const REFINE_SHAPE = '{ approved, critique } (runtime-enforced)'
const VERDICT_SHAPE = '{ refuted, reason } (runtime-enforced)'
const FREE_TEXT_SHAPE = 'free text'
const FINAL_OUTPUT = 'final output of the run'

interface BuildOpts {
  ref: string | null
  role: InstanceRole
  n?: number
  dropped?: boolean
  /** Pre-built read segments (phase reads, or the lead-context pseudo-read for grantees). */
  reads?: ReceiveSegment[]
  item?: ReceiveSegment
  shape: string
  collectedInto: string
  /** This instance is a `parallel()` swarm member (renders a granted seat). */
  seat?: boolean
  /** In-script slice cap for the swarm (omitted when uncapped, e.g. multi-angle). */
  seatCap?: number
  /** Extra `system` facts (angle marker, merge/critique/vote note). */
  extraSys?: string[]
}

/** Assemble one instance and its truthful `receives` (empty when dropped — it never runs). */
function buildInstance(spec: WorkflowSpec, o: BuildOpts): RehearsalInstance {
  const agent = o.ref ? (spec.agents.find((a) => a.id === o.ref) ?? null) : null
  const agentName = agent ? agent.name : o.ref ? `«${o.ref}?»` : '«?»'
  const model = resolveAlias(agent?.model ?? INHERIT)

  if (o.dropped) {
    return { agentName, model, role: o.role, n: o.n, dropped: true, receives: [] }
  }

  const sys: string[] = [
    model === INHERIT ? 'session model — not pinned' : `model ${model} · enforced`,
  ]
  if (o.seat) {
    sys.push(
      o.seatCap != null && o.seatCap > 0
        ? `seat granted by parallel(), cap ${o.seatCap}`
        : 'seat granted by parallel()',
    )
  }
  if (o.extraSys) sys.push(...o.extraSys)

  const receives: ReceiveSegment[] = [{ kind: 'system', text: sys.join(' · ') }]
  if (o.reads) receives.push(...o.reads)
  if (o.item) receives.push(o.item)
  receives.push({
    kind: 'prompt',
    text: agent && agent.prompt.trim() ? agent.prompt : '(no prompt yet)',
  })
  receives.push({ kind: 'returns', shape: o.shape, collectedInto: o.collectedInto })
  return { agentName, model, role: o.role, n: o.n, dropped: false, receives }
}

// --- the derivation ----------------------------------------------------------------------

/**
 * Instantiate `spec` at a sample fan-out size `sampleN` into a tick-by-tick dry run.
 *
 * Pure and deterministic. Unsupported top-level nodes (a nested `sequence`) contribute no
 * ticks (mirrors the emitter's loud skip), keeping the projection honest rather than faking
 * an expansion the script won't run.
 */
export function rehearse(spec: WorkflowSpec, sampleN: number): Rehearsal {
  const phases = spec.root.type === 'sequence' ? spec.root.steps : [spec.root]
  const mems = deriveMemoryNames(spec)
  const concurrency = spec.caps.concurrency
  const n = Math.max(1, Math.round(Number.isFinite(sampleN) ? sampleN : 1))

  const memName = (i: number): string => mems[i]?.name ?? `phase-${i + 1}`
  const agentName = (ref: string | null): string => {
    const a = ref ? spec.agents.find((x) => x.id === ref) : null
    return a ? a.name : ref ? `«${ref}?»` : 'phase'
  }

  // nodeId → phase index, for reads resolution.
  const byIndex = new Map<string, number>()
  phases.forEach((node, i) => {
    if ('id' in node && node.id) byIndex.set(node.id, i)
  })

  const schemaForced = phases.map((_, i) => isSchemaForced(phases, i))

  const ticks: RehearsalTick[] = []
  const gaps: RehearsalGap[] = []
  const capWarnings: CapWarning[] = []
  /** Live output count per phase (feeds downstream item counts + gap labels). */
  const outCounts: number[] = new Array(phases.length).fill(1)
  /** Global tick index of each phase's last tick, or -1 for a skipped phase. */
  const lastTick: number[] = new Array(phases.length).fill(-1)

  let tickNo = 0
  const nextLabel = (): string => `T${++tickNo}`

  /** Resolve a node's `reads` to read segments (skipping forward/dangling refs). */
  const resolveReads = (node: PatternNode, index: number): ReceiveSegment[] => {
    const reads = 'reads' in node ? (node.reads ?? []) : []
    const out: ReceiveSegment[] = []
    for (const target of reads) {
      const at = byIndex.get(target)
      if (at === undefined || at >= index) continue // forward/dangling — surfaced elsewhere
      const name = memName(at)
      const prev = phases[at]
      if (prev.type === 'branches') {
        // Mirrors the emitter: a branches memory splices one labeled block per branch.
        const labels = branchLabels(spec, prev)
        prev.branches.forEach((ref, k) => {
          const from = agentName(ref)
          out.push({
            kind: 'read',
            memoryName: labels[k],
            fromAgent: from,
            placeholder: readPlaceholder(from),
            source: `spliced because this phase reads → ${name} (branch ${k + 1} of ${prev.branches.length})`,
          })
        })
        continue
      }
      const from = agentName(outputAgentRef(prev))
      out.push({
        kind: 'read',
        memoryName: name,
        fromAgent: from,
        placeholder: readPlaceholder(from),
        source: `spliced because this phase reads → ${name}`,
      })
    }
    return out
  }

  /**
   * The item list a consuming phase (fan-out / map) iterates — count + per-item provenance —
   * mirroring the emitter's `itemsExpr`.
   */
  const itemSource = (index: number): { count: number; describe: (k: number) => string } => {
    if (index === 0) {
      return { count: n, describe: () => 'from the workflow args (heuristic split)' }
    }
    const prev = phases[index - 1]
    const prevMem = memName(index - 1)
    if (schemaForced[index - 1]) {
      return {
        count: n,
        describe: (k) => `from ${prevMem}.items[${k - 1}] — exact array, not a string split`,
      }
    }
    if (yieldsItemArray(prev)) {
      const c = outCounts[index - 1]
      return {
        count: c,
        describe:
          prev.type === 'verify'
            ? () => `from ${prevMem} — the ≤${c} majority-gate survivors (exact array)`
            : () => `from ${prevMem} — exact array of ${c} outputs (not a string split)`,
      }
    }
    return { count: n, describe: () => 'from a heuristic split of the previous output' }
  }

  const pushTick = (t: Omit<RehearsalTick, 'seatsUsed' | 'queued'>): void => {
    const live = t.instances.filter((i) => !i.dropped).length
    ticks.push({
      ...t,
      seatsUsed: Math.min(live, concurrency),
      queued: Math.max(0, live - concurrency),
    })
  }

  for (let i = 0; i < phases.length; i++) {
    const node = phases[i]
    const nodeId = 'id' in node ? node.id : undefined
    const mem = memName(i)
    const isLast = i === phases.length - 1
    const terminalCollect = isLast ? FINAL_OUTPUT : mem
    const reads = resolveReads(node, i)

    switch (node.type) {
      case 'agent': {
        const grant = node.grants && node.grants[0]
        if (!grant) {
          // step
          const forced = schemaForced[i]
          pushTick({
            label: nextLabel(),
            phaseIndex: i,
            nodeId,
            kind: 'step',
            instances: [
              buildInstance(spec, {
                ref: node.agent,
                role: 'solo',
                reads,
                shape: forced ? CONTEXT_ITEMS_SHAPE : FREE_TEXT_SHAPE,
                collectedInto: terminalCollect,
              }),
            ],
          })
          outCounts[i] = 1
          lastTick[i] = ticks.length - 1
          break
        }
        // delegate: lead (schema-forced) then a capped grantee swarm over the lead's items.
        const leadName = agentName(node.agent)
        const granteeName = agentName(grant.agent)
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'delegate',
          stage: 'lead',
          instances: [
            buildInstance(spec, {
              ref: node.agent,
              role: 'lead',
              reads,
              shape: CONTEXT_ITEMS_SHAPE,
              collectedInto: `handed to ${granteeName} in this phase`,
            }),
          ],
        })

        const incoming = n // lead's item list is schema-forced with sampleN items
        const cap = grant.cap
        const leadContext: ReceiveSegment = {
          kind: 'read',
          memoryName: `${leadName} context`,
          fromAgent: leadName,
          placeholder: readPlaceholder(leadName),
          source: `the lead's shared context (intra-phase — not a named memory)`,
        }
        const grantees: RehearsalInstance[] = []
        for (let k = 1; k <= incoming; k++) {
          const dropped = k > cap
          grantees.push(
            buildInstance(spec, {
              ref: grant.agent,
              role: 'grantee',
              n: k,
              dropped,
              seat: true,
              seatCap: cap,
              reads: [leadContext],
              item: itemSeg(k, incoming, `from the lead's item list [${k - 1}] — exact array, not a string split`),
              shape: FREE_TEXT_SHAPE,
              collectedInto: terminalCollect,
            }),
          )
        }
        if (incoming > cap) {
          capWarnings.push({ phaseIndex: i, nodeId, kind: 'delegate', cap, incoming, dropped: incoming - cap })
        }
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'delegate',
          stage: 'delegates',
          instances: grantees,
        })
        outCounts[i] = Math.min(incoming, cap)
        lastTick[i] = ticks.length - 1
        break
      }

      case 'fanout': {
        const src = itemSource(i)
        const incoming = src.count
        const cap = node.cap
        const instances: RehearsalInstance[] = []
        for (let k = 1; k <= incoming; k++) {
          const dropped = k > cap
          instances.push(
            buildInstance(spec, {
              ref: node.agent,
              role: 'worker',
              n: k,
              dropped,
              seat: true,
              seatCap: cap,
              reads,
              item: itemSeg(k, incoming, src.describe(k)),
              shape: FREE_TEXT_SHAPE,
              collectedInto: terminalCollect,
            }),
          )
        }
        if (incoming > cap) {
          capWarnings.push({ phaseIndex: i, nodeId, kind: 'fanout', cap, incoming, dropped: incoming - cap })
        }
        pushTick({ label: nextLabel(), phaseIndex: i, nodeId, kind: 'fanout', instances })
        outCounts[i] = Math.min(incoming, cap)
        lastTick[i] = ticks.length - 1
        break
      }

      case 'iterateUntil': {
        const ref = node.body.type === 'agent' ? node.body.agent : null
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'loop',
          note: `× up to ${node.maxIter}, sequential — may stop early`,
          instances: [
            buildInstance(spec, {
              ref,
              role: 'loop-body',
              reads,
              shape: LOOP_SHAPE,
              collectedInto: terminalCollect,
            }),
          ],
        })
        outCounts[i] = 1
        lastTick[i] = ticks.length - 1
        break
      }

      case 'mapReduce': {
        const src = itemSource(i)
        const incoming = src.count
        const cap = node.map.cap
        const mappers: RehearsalInstance[] = []
        for (let k = 1; k <= incoming; k++) {
          const dropped = k > cap
          mappers.push(
            buildInstance(spec, {
              ref: node.map.agent,
              role: 'mapper',
              n: k,
              dropped,
              seat: true,
              seatCap: cap,
              reads,
              item: itemSeg(k, incoming, src.describe(k)),
              shape: FREE_TEXT_SHAPE,
              collectedInto: 'collected for the reduce step',
            }),
          )
        }
        if (incoming > cap) {
          capWarnings.push({ phaseIndex: i, nodeId, kind: 'mapReduce', cap, incoming, dropped: incoming - cap })
        }
        pushTick({ label: nextLabel(), phaseIndex: i, nodeId, kind: 'mapReduce', stage: 'map', instances: mappers })

        const mapLive = Math.min(incoming, cap)
        const forced = schemaForced[i]
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'mapReduce',
          stage: 'reduce',
          instances: [
            buildInstance(spec, {
              ref: node.reduce,
              role: 'reducer',
              reads,
              extraSys: [`+ the ${mapLive} map output(s) to merge`],
              shape: forced ? CONTEXT_ITEMS_SHAPE : FREE_TEXT_SHAPE,
              collectedInto: terminalCollect,
            }),
          ],
        })
        outCounts[i] = 1
        lastTick[i] = ticks.length - 1
        break
      }

      case 'adversarial': {
        const criticName = agentName(node.critic)
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'adversarial',
          stage: 'draft',
          instances: [
            buildInstance(spec, {
              ref: node.producer,
              role: 'producer',
              reads,
              shape: FREE_TEXT_SHAPE,
              collectedInto: `handed to ${criticName} in this phase`,
            }),
          ],
        })
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'adversarial',
          stage: 'critique',
          instances: [
            buildInstance(spec, {
              ref: node.critic,
              role: 'critic',
              reads,
              extraSys: ["+ the producer's draft to attack"],
              shape: FREE_TEXT_SHAPE,
              collectedInto: terminalCollect,
            }),
          ],
        })
        outCounts[i] = 1
        lastTick[i] = ticks.length - 1
        break
      }

      case 'refine': {
        // Bounded revise loop: one drafter + one judge per round, sequential; the loop bound
        // and early-stop live in the note (mirrors how `loop` counts its body once).
        const note = `× up to ${node.maxIter} revisions, sequential — stops when approved`
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'refine',
          stage: 'draft',
          note,
          instances: [
            buildInstance(spec, {
              ref: node.producer,
              role: 'producer',
              reads,
              extraSys: ['+ the judge’s critique on every revision after the first'],
              shape: FREE_TEXT_SHAPE,
              collectedInto: terminalCollect,
            }),
          ],
        })
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'refine',
          stage: 'judge',
          note,
          instances: [
            buildInstance(spec, {
              ref: node.critic,
              role: 'critic',
              reads,
              extraSys: ['+ the draft to judge'],
              shape: REFINE_SHAPE,
              collectedInto: `approve/reject — gates ${agentName(node.producer)}’s next revision`,
            }),
          ],
        })
        outCounts[i] = 1
        lastTick[i] = ticks.length - 1
        break
      }

      case 'verify': {
        // Per-item refuter jury: `votes` independent skeptics per (capped) item; items beyond
        // the cap are dropped in-script. Survivors are decided at run time by the majority
        // gate, so downstream counts are upper bounds.
        const src = itemSource(i)
        const incoming = src.count
        const cap = node.cap
        const skeptics: RehearsalInstance[] = []
        for (let k = 1; k <= incoming; k++) {
          if (k > cap) {
            // One dropped card per dropped ITEM (its whole jury never convenes).
            skeptics.push(
              buildInstance(spec, {
                ref: node.skeptic,
                role: 'skeptic',
                n: k,
                dropped: true,
                seat: true,
                seatCap: cap,
                shape: VERDICT_SHAPE,
                collectedInto: 'counted toward the majority gate',
              }),
            )
            continue
          }
          for (let v = 1; v <= node.votes; v++) {
            skeptics.push(
              buildInstance(spec, {
                ref: node.skeptic,
                role: 'skeptic',
                n: (k - 1) * node.votes + v,
                seat: true,
                reads,
                item: itemSeg(k, incoming, src.describe(k)),
                extraSys: [`vote ${v} of ${node.votes} on item ${k} — independent take`],
                shape: VERDICT_SHAPE,
                collectedInto: 'counted toward the majority gate',
              }),
            )
          }
        }
        if (incoming > cap) {
          capWarnings.push({ phaseIndex: i, nodeId, kind: 'verify', cap, incoming, dropped: incoming - cap })
        }
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'verify',
          note: 'majority gate — survivors decided at run time',
          instances: skeptics,
        })
        outCounts[i] = Math.min(incoming, cap) // upper bound: the gate can only shrink it
        lastTick[i] = ticks.length - 1
        break
      }

      case 'branches': {
        // Heterogeneous parallel: every branch agent runs once, all at the same tick, each
        // with the same reads. The memory is the branch-ordered array of their outputs.
        const total = node.branches.length
        const instances = node.branches.map((ref, k) =>
          buildInstance(spec, {
            ref,
            role: 'branch',
            n: k + 1,
            seat: true, // parallel(), uncapped in-script (exactly one per branch) — concurrency-queued
            reads,
            extraSys: [`branch ${k + 1} of ${total} — its own task, same reads`],
            shape: FREE_TEXT_SHAPE,
            collectedInto: isLast ? FINAL_OUTPUT : `${mem}[${k}]`,
          }),
        )
        pushTick({ label: nextLabel(), phaseIndex: i, nodeId, kind: 'branches', instances })
        outCounts[i] = total
        lastTick[i] = ticks.length - 1
        break
      }

      case 'multiAngle': {
        const takes: RehearsalInstance[] = []
        for (let k = 1; k <= node.angles; k++) {
          takes.push(
            buildInstance(spec, {
              ref: node.agent,
              role: 'take',
              n: k,
              seat: true, // parallel(), but uncapped in-script (no slice) — concurrency-queued
              reads,
              extraSys: [`angle ${k} of ${node.angles} — independent take, same input`],
              shape: FREE_TEXT_SHAPE,
              collectedInto: 'collected for the vote',
            }),
          )
        }
        pushTick({ label: nextLabel(), phaseIndex: i, nodeId, kind: 'multiAngle', stage: 'takes', instances: takes })

        const forced = schemaForced[i]
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'multiAngle',
          stage: 'vote',
          instances: [
            buildInstance(spec, {
              ref: node.vote,
              role: 'voter',
              reads,
              extraSys: [`+ the ${node.angles} candidate take(s)`],
              shape: forced ? CONTEXT_ITEMS_SHAPE : FREE_TEXT_SHAPE,
              collectedInto: terminalCollect,
            }),
          ],
        })
        outCounts[i] = 1
        lastTick[i] = ticks.length - 1
        break
      }

      default:
        // Nested `sequence` at the top level is unsupported (the emitter throws) — contribute
        // no ticks rather than fake an expansion. outCounts stays 1 (nominal); lastTick -1.
        break
    }
  }

  // Handoff labels between phases (only where the producing phase actually ran a tick).
  for (let i = 0; i < phases.length - 1; i++) {
    if (lastTick[i] < 0) continue
    const node = phases[i]
    const mem = memName(i)
    let countLabel: string
    if (schemaForced[i]) {
      countLabel = `${mem}.items[] — ${n} items in this rehearsal`
    } else if (node.type === 'verify') {
      countLabel = `${mem} — ≤ ${outCounts[i]} survivors (majority gate)`
    } else if (node.type === 'branches') {
      countLabel = `${mem} — ${outCounts[i]} labeled outputs`
    } else if (node.type === 'fanout' || (node.type === 'agent' && !!node.grants && node.grants.length > 0)) {
      countLabel = `${mem} — ${outCounts[i]} outputs`
    } else {
      countLabel = `${mem} — 1 output`
    }
    gaps.push({ afterTickIndex: lastTick[i], memoryName: mem, countLabel })
  }

  const liveOf = (t: RehearsalTick): number => t.instances.filter((x) => !x.dropped).length
  const totalAgents = ticks.reduce((sum, t) => sum + liveOf(t), 0)
  const peakSeats = ticks.reduce((mx, t) => Math.max(mx, t.seatsUsed), 0)
  const breakdown = ticks
    .map((t) => (isParallelTick(t) ? `${liveOf(t)}∥` : `${liveOf(t)}`))
    .join(' + ')

  return { ticks, gaps, totalAgents, peakSeats, breakdown, capWarnings }
}
