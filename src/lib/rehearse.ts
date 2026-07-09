/**
 * Rehearsal derivation — a truthful, read-only dry-run of what the emitted script does.
 *
 * The Studio "Rehearsal" view instantiates the spec at each pattern's cap ceiling and shows,
 * tick by tick, exactly which agents run, how many seats they take against the concurrency
 * cap, and — for one worker — the fully assembled input it receives. This module is that
 * view's data model: a pure, deterministic projection of a `WorkflowSpec`.
 *
 * It MUST mirror `emit/scriptEmitter.ts` exactly (guardrail #5 — never claim behavior the
 * script doesn't produce):
 *   - A fan-out / map / grantee / verify swarm is sliced to its cap in-script (`.slice(0,
 *     cap)`), so the rehearsal instantiates it at exactly that cap ceiling — the honest upper
 *     bound of how many run. When the producer's item count is dynamic (workflow args, a
 *     schema-forced `{ context, items }` producer) or a known array longer than the cap, a
 *     calm note discloses that extras beyond the cap aren't processed. When the upstream is a
 *     known array no longer than the cap (a prior fan-out/branches), the count follows it and
 *     nothing is truncated.
 *   - `reads` splice into every agent of a phase (both stages of a composite) EXCEPT delegate
 *     grantees, which instead receive the lead's intra-phase `context`.
 *   - Only runtime-enforced facts are marked "enforced": a pinned model; an `inherit` model is
 *     explicitly "not pinned". Caps/iters/angles are literal in-script (bounds, shown as such).
 *
 * Nothing here reads the clock or randomness — same spec ⇒ same rehearsal.
 */
import { INHERIT, resolveAlias } from '@/lib/models'
import { branchLabels, deriveMemoryNames } from '@/lib/memoryNames'
import { consumesItems, isSchemaForced, yieldsItemArray } from '@/emit/plumbing'
import type { PatternKey } from '@/lib/patterns'
import { launchInput, type PatternNode, type WorkflowSpec } from '@/spec/schema'

/** One labeled block of a worker's fully-assembled input (see the anatomy card). */
export type ReceiveSegment =
  /** Runtime-enforced / structural facts only: the pinned (or not-pinned) model, a granted
   *  seat, an intra-phase merge note. The text itself carries the honesty ("· enforced" vs
   *  "not pinned") — a segment never asserts enforcement the script doesn't inject. */
  | { kind: 'system'; text: string }
  /** A named memory this phase reads, spliced as a labeled `[name]` block. */
  | { kind: 'read'; memoryName: string; fromAgent: string; placeholder: string; source: string }
  /** The workflow's launch input (`args`), spliced into phase 1 as a labeled `[label]` block. */
  | { kind: 'input'; label: string; description?: string; placeholder: string }
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
  /** Instances actually seated this tick = min(instance count, concurrency). */
  seatsUsed: number
  /** Instances beyond the concurrency cap — they wait (queued, NOT dropped). */
  queued: number
}

export interface RehearsalGap {
  /** Index into `ticks` after which this handoff label renders. */
  afterTickIndex: number
  memoryName: string
  countLabel: string
}

export interface Rehearsal {
  ticks: RehearsalTick[]
  gaps: RehearsalGap[]
  /** Instances summed; a loop counts once (its bound is in the note). */
  totalAgents: number
  /** Max `seatsUsed` across ticks. */
  peakSeats: number
  /** Per-tick counts joined by " + ", parallel swarm ticks marked `N∥` (e.g. "1 + 8∥ + 1"). */
  breakdown: string
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

/** Assemble one instance and its truthful `receives`. */
function buildInstance(spec: WorkflowSpec, o: BuildOpts): RehearsalInstance {
  const agent = o.ref ? (spec.agents.find((a) => a.id === o.ref) ?? null) : null
  const agentName = agent ? agent.name : o.ref ? `«${o.ref}?»` : '«?»'
  const model = resolveAlias(agent?.model ?? INHERIT)

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
  return { agentName, model, role: o.role, n: o.n, receives }
}

// --- the derivation ----------------------------------------------------------------------

/**
 * Instantiate `spec` at each pattern's cap ceiling into a tick-by-tick dry run.
 *
 * Pure and deterministic. Unsupported top-level nodes (a nested `sequence`) contribute no
 * ticks (mirrors the emitter's loud skip), keeping the projection honest rather than faking
 * an expansion the script won't run.
 */
export function rehearse(spec: WorkflowSpec): Rehearsal {
  const phases = spec.root.type === 'sequence' ? spec.root.steps : [spec.root]
  const mems = deriveMemoryNames(spec)
  const concurrency = spec.caps.concurrency

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
  /** Output count per phase (feeds downstream item counts + gap labels). */
  const outCounts: number[] = new Array(phases.length).fill(1)
  /** Global tick index of each phase's last tick, or -1 for a skipped phase. */
  const lastTick: number[] = new Array(phases.length).fill(-1)

  let tickNo = 0
  const nextLabel = (): string => `T${++tickNo}`

  /** Resolve a node's `reads` to read segments (skipping forward/dangling refs). */
  const resolveReads = (node: PatternNode, index: number): ReceiveSegment[] => {
    const out: ReceiveSegment[] = []
    // Phase 1 receives the launch input as a labeled block — unless it already consumes
    // `args` as items (a fan-out/map/verify), where the input surfaces as the item source.
    const input = launchInput(spec)
    if (index === 0 && input && !consumesItems(node)) {
      out.push({
        kind: 'input',
        label: input.label,
        description: input.description,
        placeholder: `‹the ${input.label} you launch with›`,
      })
    }
    const reads = 'reads' in node ? (node.reads ?? []) : []
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
   * The item list a consuming phase (fan-out / map / verify) iterates — its known upstream
   * length (or `null` when the count is dynamic and only bounded by the consumer's cap) plus
   * per-item provenance — mirroring the emitter's `itemsExpr`. A consumer renders
   * `upstream == null ? cap : min(upstream, cap)` instances (the honest cap ceiling).
   */
  const itemSource = (index: number): { upstream: number | null; describe: (k: number) => string } => {
    if (index === 0) {
      const input = launchInput(spec)
      const src = input ? `the launch input [${input.label}]` : 'the workflow args'
      return { upstream: null, describe: () => `from ${src} (heuristic split)` }
    }
    const prev = phases[index - 1]
    const prevMem = memName(index - 1)
    if (schemaForced[index - 1]) {
      return {
        upstream: null,
        describe: (k) => `from ${prevMem}.items[${k - 1}] — exact array, not a string split`,
      }
    }
    if (yieldsItemArray(prev)) {
      const c = outCounts[index - 1]
      return {
        upstream: c,
        describe:
          prev.type === 'verify'
            ? () => `from ${prevMem} — the ≤${c} majority-gate survivors (exact array)`
            : () => `from ${prevMem} — exact array of ${c} outputs (not a string split)`,
      }
    }
    return { upstream: null, describe: () => 'from a heuristic split of the previous output' }
  }

  /** Instances rendered for a cap-sliced consumer, and whether the slice can truncate. */
  const cappedCount = (
    src: { upstream: number | null },
    cap: number,
  ): { count: number; truncates: boolean } =>
    src.upstream == null
      ? { count: cap, truncates: true }
      : { count: Math.min(src.upstream, cap), truncates: src.upstream > cap }

  /** The calm one-line truncation note (only when the slice can actually drop items). */
  const capNote = (cap: number): string =>
    `takes the first ${cap} item(s) the producer yields — any beyond ${cap} aren't processed`

  const pushTick = (t: Omit<RehearsalTick, 'seatsUsed' | 'queued'>): void => {
    const live = t.instances.length
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

        // The lead's item list is schema-forced and dynamic, so the grantee swarm is
        // rendered at exactly the grant cap (its ceiling) — the slice can always truncate.
        const cap = grant.cap
        const count = cap
        const leadContext: ReceiveSegment = {
          kind: 'read',
          memoryName: `${leadName} context`,
          fromAgent: leadName,
          placeholder: readPlaceholder(leadName),
          source: `the lead's shared context (intra-phase — not a named memory)`,
        }
        const grantees: RehearsalInstance[] = []
        for (let k = 1; k <= count; k++) {
          grantees.push(
            buildInstance(spec, {
              ref: grant.agent,
              role: 'grantee',
              n: k,
              seat: true,
              seatCap: cap,
              reads: [leadContext],
              item: itemSeg(k, count, `from the lead's item list [${k - 1}] — exact array, not a string split`),
              shape: FREE_TEXT_SHAPE,
              collectedInto: terminalCollect,
            }),
          )
        }
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'delegate',
          stage: 'delegates',
          note: capNote(cap),
          instances: grantees,
        })
        outCounts[i] = count
        lastTick[i] = ticks.length - 1
        break
      }

      case 'fanout': {
        const src = itemSource(i)
        const cap = node.cap
        const { count, truncates } = cappedCount(src, cap)
        const instances: RehearsalInstance[] = []
        for (let k = 1; k <= count; k++) {
          instances.push(
            buildInstance(spec, {
              ref: node.agent,
              role: 'worker',
              n: k,
              seat: true,
              seatCap: cap,
              reads,
              item: itemSeg(k, count, src.describe(k)),
              shape: FREE_TEXT_SHAPE,
              collectedInto: terminalCollect,
            }),
          )
        }
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'fanout',
          note: truncates ? capNote(cap) : undefined,
          instances,
        })
        outCounts[i] = count
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
        const cap = node.map.cap
        const { count, truncates } = cappedCount(src, cap)
        const mappers: RehearsalInstance[] = []
        for (let k = 1; k <= count; k++) {
          mappers.push(
            buildInstance(spec, {
              ref: node.map.agent,
              role: 'mapper',
              n: k,
              seat: true,
              seatCap: cap,
              reads,
              item: itemSeg(k, count, src.describe(k)),
              shape: FREE_TEXT_SHAPE,
              collectedInto: 'collected for the reduce step',
            }),
          )
        }
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'mapReduce',
          stage: 'map',
          note: truncates ? capNote(cap) : undefined,
          instances: mappers,
        })

        const mapLive = count
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
        // Per-item refuter jury: `votes` independent skeptics per (capped) item. The item pool
        // is rendered at the cap ceiling; survivors are decided at run time by the majority
        // gate, so downstream counts are upper bounds.
        const src = itemSource(i)
        const cap = node.cap
        const { count, truncates } = cappedCount(src, cap)
        const skeptics: RehearsalInstance[] = []
        for (let k = 1; k <= count; k++) {
          for (let v = 1; v <= node.votes; v++) {
            skeptics.push(
              buildInstance(spec, {
                ref: node.skeptic,
                role: 'skeptic',
                n: (k - 1) * node.votes + v,
                seat: true,
                reads,
                item: itemSeg(k, count, src.describe(k)),
                extraSys: [`vote ${v} of ${node.votes} on item ${k} — independent take`],
                shape: VERDICT_SHAPE,
                collectedInto: 'counted toward the majority gate',
              }),
            )
          }
        }
        const note = truncates
          ? `majority gate — survivors decided at run time · ${capNote(cap)}`
          : 'majority gate — survivors decided at run time'
        pushTick({
          label: nextLabel(),
          phaseIndex: i,
          nodeId,
          kind: 'verify',
          note,
          instances: skeptics,
        })
        outCounts[i] = count // upper bound: the gate can only shrink it
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
      // The producer yields a dynamic { context, items }; the next phase slices it to its cap.
      const consumer = phases[i + 1]
      const consumerCap =
        consumer?.type === 'fanout'
          ? consumer.cap
          : consumer?.type === 'mapReduce'
            ? consumer.map.cap
            : consumer?.type === 'verify'
              ? consumer.cap
              : undefined
      countLabel =
        consumerCap != null
          ? `${mem}.items[] — up to ${consumerCap} taken (cap)`
          : `${mem}.items[] — exact array`
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

  const countOf = (t: RehearsalTick): number => t.instances.length
  const totalAgents = ticks.reduce((sum, t) => sum + countOf(t), 0)
  const peakSeats = ticks.reduce((mx, t) => Math.max(mx, t.seatsUsed), 0)
  const breakdown = ticks
    .map((t) => (isParallelTick(t) ? `${countOf(t)}∥` : `${countOf(t)}`))
    .join(' + ')

  return { ticks, gaps, totalAgents, peakSeats, breakdown }
}
