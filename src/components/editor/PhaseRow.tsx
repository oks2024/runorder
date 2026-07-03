import { useWorkflowStore } from '@/store/workflowStore'
import { deriveMemoryNames } from '@/lib/memoryNames'
import { isSchemaForced } from '@/emit/plumbing'
import type { PatternNode } from '@/spec/schema'
import { cn } from '@/lib/utils'
import { AgentSelect } from './AgentSelect'
import { PATTERN_INFO, ROLE_TIPS } from './patternInfo'

const iconBtn =
  'rounded-[5px] border border-transparent px-1.5 py-0.5 font-mono text-xs leading-none text-ink-faint hover:border-line hover:text-ink disabled:opacity-40 disabled:hover:border-transparent'

/** Any composition node the flat editor can render (everything except a nested sequence). */
type EditableNode = Exclude<PatternNode, { type: 'sequence' }>

const stepBadge = 'border-line bg-well text-ink-dim'
const dynBadge = 'border-intended/40 bg-intended/10 text-intended'

/** One phase in the flat list. Renders a badge, a primary agent, and — per pattern — a
 *  numeric knob and/or a secondary agent. */
export function PhaseRow({ node, index, count }: { node: EditableNode; index: number; count: number }) {
  const movePhase = useWorkflowStore((s) => s.movePhase)
  const removePhase = useWorkflowStore((s) => s.removePhase)
  const setPhaseAgent = useWorkflowStore((s) => s.setPhaseAgent)
  const setPhaseSecondaryAgent = useWorkflowStore((s) => s.setPhaseSecondaryAgent)
  const setFanoutCap = useWorkflowStore((s) => s.setFanoutCap)
  const setLoopMaxIter = useWorkflowStore((s) => s.setLoopMaxIter)
  const setMapCap = useWorkflowStore((s) => s.setMapCap)
  const setAngles = useWorkflowStore((s) => s.setAngles)
  const setGrantCap = useWorkflowStore((s) => s.setGrantCap)
  const setReads = useWorkflowStore((s) => s.setReads)
  const spec = useWorkflowStore((s) => s.spec)

  const grant = node.type === 'agent' ? node.grants?.[0] : undefined

  // --- explicit context flow: this phase's reads + the memories it could read ---
  const phases = spec.root.type === 'sequence' ? spec.root.steps : []
  const memories = deriveMemoryNames(spec) // aligned with `phases` by index
  const memoryAt = new Map<string, { name: string; at: number }>()
  memories.forEach((m, at) => {
    if (m.nodeId) memoryAt.set(m.nodeId, { name: m.name, at })
  })
  const reads = node.reads ?? []
  const readable = memories
    .slice(0, index)
    .filter((m): m is { nodeId: string; name: string } => !!m.nodeId && !reads.includes(m.nodeId))
  // Output is runtime-forced to { context, items }: feeds a fan-out, or delegates.
  const forced = (phases.length > index && isSchemaForced(phases, index)) || !!grant

  const patternKey =
    node.type === 'fanout'
      ? 'fanout'
      : node.type === 'iterateUntil'
        ? 'loop'
        : node.type === 'mapReduce'
          ? 'mapReduce'
          : node.type === 'adversarial'
            ? 'adversarial'
            : node.type === 'multiAngle'
              ? 'multiAngle'
              : grant
                ? 'delegate'
                : 'step'
  const badge = {
    cls: patternKey === 'step' ? stepBadge : dynBadge,
    label: PATTERN_INFO[patternKey].badge,
    tip: PATTERN_INFO[patternKey].tip,
  }

  const primaryRef =
    node.type === 'iterateUntil'
      ? node.body.type === 'agent'
        ? node.body.agent
        : ''
      : node.type === 'mapReduce'
        ? node.map.agent
        : node.type === 'adversarial'
          ? node.producer
          : node.agent // agent | fanout | multiAngle

  const knob =
    node.type === 'fanout'
      ? { value: node.cap, min: 1, max: 16, label: 'cap', aria: 'Fan-out cap', set: setFanoutCap }
      : node.type === 'iterateUntil'
        ? { value: node.maxIter, min: 1, max: 20, label: '≤ iters', aria: 'Loop max iterations', set: setLoopMaxIter }
        : node.type === 'mapReduce'
          ? { value: node.map.cap, min: 1, max: 16, label: 'map cap', aria: 'Map cap', set: setMapCap }
          : node.type === 'multiAngle'
            ? { value: node.angles, min: 1, max: 8, label: 'angles', aria: 'Angles', set: setAngles }
            : grant
              ? { value: grant.cap, min: 1, max: 16, label: '≤ cap', aria: 'Delegation cap', set: setGrantCap }
              : null

  const secondary =
    node.type === 'mapReduce'
      ? { ref: node.reduce, label: 'reduce' as const }
      : node.type === 'adversarial'
        ? { ref: node.critic, label: 'critic' as const }
        : node.type === 'multiAngle'
          ? { ref: node.vote, label: 'vote' as const }
          : grant
            ? { ref: grant.agent, label: 'delegate' as const }
            : null

  return (
    <div className="relative mb-1 rounded-[10px] border border-line-soft border-l-[3px] bg-gradient-to-b from-panel2 to-panel p-2.5 focus-within:outline-2 focus-within:outline-focus">
      <div className="flex items-center gap-2">
        <span className="w-[18px] text-center font-mono text-[11px] font-semibold text-ink-dim">
          {index + 1}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase',
            badge.cls,
          )}
          title={badge.tip}
        >
          {badge.label}
        </span>
        {forced && (
          <span
            className="inline-flex items-center gap-1 rounded-[5px] border border-enforced/40 bg-enforced/10 px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.12em] text-enforced uppercase"
            title="Feeds a fan-out: output is runtime-forced to { context, items } — readers get the context, the fan-out maps the exact items"
          >
            <span className="size-[5px] rounded-full bg-enforced shadow-[0_0_6px_var(--color-enforced)]" />
            items[]
          </span>
        )}
        <span className="ml-auto inline-flex gap-0.5">
          <button type="button" className={iconBtn} title="Move up" disabled={index === 0} onClick={() => movePhase(index, -1)}>
            ↑
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Move down"
            disabled={index === count - 1}
            onClick={() => movePhase(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className={cn(iconBtn, 'hover:border-danger/45 hover:text-danger')}
            title="Remove phase"
            onClick={() => removePhase(index)}
          >
            ✕
          </button>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 pl-[18px]">
        <AgentSelect value={primaryRef} onChange={(id) => setPhaseAgent(index, id)} />
        {knob && (
          <span
            className="inline-flex flex-none items-center gap-1.5 rounded-md border border-intended/40 bg-intended/10 px-2 py-1 font-mono text-[11px] text-intended"
            title="A bounded count — intended, enforced in the emitted script"
          >
            <span className="text-[9.5px] tracking-[0.06em] uppercase">{knob.label}</span>
            <input
              type="number"
              min={knob.min}
              max={knob.max}
              value={knob.value}
              onChange={(e) => knob.set(index, e.target.valueAsNumber)}
              className="w-[38px] rounded border border-intended/35 bg-well px-1 py-px text-center font-mono text-xs font-semibold text-intended outline-none focus-visible:outline-2 focus-visible:outline-focus"
              aria-label={knob.aria}
            />
          </span>
        )}
      </div>

      {secondary && (
        <div className="mt-1.5 flex items-center gap-2 pl-[18px]">
          <span
            className="w-[52px] flex-none text-right font-mono text-[9.5px] tracking-[0.08em] text-ink-faint uppercase"
            title={ROLE_TIPS[secondary.label]}
          >
            {secondary.label} →
          </span>
          <AgentSelect value={secondary.ref} onChange={(id) => setPhaseSecondaryAgent(index, id)} />
        </div>
      )}

      {(reads.length > 0 || readable.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[18px]">
          <span
            className="w-[52px] flex-none text-right font-mono text-[9.5px] tracking-[0.08em] text-ink-faint uppercase"
            title="The earlier-phase memories spliced into this phase's prompts — nothing else flows in"
          >
            reads →
          </span>
          {reads.map((target) => {
            const hit = memoryAt.get(target)
            const valid = hit !== undefined && hit.at < index
            return (
              <button
                key={target}
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px]',
                  valid
                    ? 'border-line bg-well text-ink-dim hover:border-danger/45 hover:text-danger'
                    : 'border-danger/45 bg-danger/10 text-danger',
                )}
                title={
                  valid
                    ? `Remove read "${hit.name}"`
                    : `Unresolved read "${target}" — the phase it points at is gone or later; click to remove`
                }
                onClick={() =>
                  setReads(
                    index,
                    reads.filter((r) => r !== target),
                  )
                }
              >
                [{valid ? hit.name : `${target}?`}] ×
              </button>
            )
          })}
          {readable.length > 0 && (
            <select
              value=""
              aria-label="Add read"
              className="rounded-md border border-dashed border-line bg-transparent px-1.5 py-0.5 font-mono text-[10.5px] text-ink-faint outline-none hover:border-ink-faint hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-focus"
              onChange={(e) => {
                if (e.target.value) setReads(index, [...reads, e.target.value])
              }}
            >
              <option value="">+ read…</option>
              {readable.map((m) => (
                <option key={m.nodeId} value={m.nodeId}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}
