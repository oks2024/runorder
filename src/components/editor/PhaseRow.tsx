import { useWorkflowStore } from '@/store/workflowStore'
import type { PatternNode } from '@/spec/schema'
import { cn } from '@/lib/utils'
import { AgentSelect } from './AgentSelect'

const iconBtn =
  'rounded-[5px] border border-transparent px-1.5 py-0.5 font-mono text-xs leading-none text-ink-faint hover:border-line hover:text-ink disabled:opacity-40 disabled:hover:border-transparent'

/** One phase in the flat list: a step (single agent) or a fan-out (agent + cap). */
export function PhaseRow({
  node,
  index,
  count,
}: {
  node: Extract<PatternNode, { type: 'agent' | 'fanout' }>
  index: number
  count: number
}) {
  const movePhase = useWorkflowStore((s) => s.movePhase)
  const removePhase = useWorkflowStore((s) => s.removePhase)
  const setPhaseAgent = useWorkflowStore((s) => s.setPhaseAgent)
  const setFanoutCap = useWorkflowStore((s) => s.setFanoutCap)

  const isFanout = node.type === 'fanout'

  return (
    <div className="relative mb-1 rounded-[10px] border border-line-soft border-l-[3px] bg-gradient-to-b from-panel2 to-panel p-2.5 focus-within:outline-2 focus-within:outline-focus">
      <div className="flex items-center gap-2">
        <span className="w-[18px] text-center font-mono text-[11px] font-semibold text-ink-dim">
          {index + 1}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase',
            isFanout
              ? 'border-intended/40 bg-intended/10 text-intended'
              : 'border-line bg-well text-ink-dim',
          )}
        >
          {isFanout ? '⋔ Fan-out' : '● Step'}
        </span>
        <span className="ml-auto inline-flex gap-0.5">
          <button
            type="button"
            className={iconBtn}
            title="Move up"
            disabled={index === 0}
            onClick={() => movePhase(index, -1)}
          >
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
        <AgentSelect value={node.agent} onChange={(id) => setPhaseAgent(index, id)} />
        {isFanout && (
          <span
            className="inline-flex flex-none items-center gap-1.5 rounded-md border border-intended/40 bg-intended/10 px-2 py-1 font-mono text-[11px] text-intended"
            title="Ceiling on parallel instances — intended, not guaranteed"
          >
            <span className="text-[9.5px] tracking-[0.06em] uppercase">cap</span>
            <input
              type="number"
              min={1}
              max={16}
              value={node.cap}
              onChange={(e) => setFanoutCap(index, e.target.valueAsNumber)}
              className="w-[38px] rounded border border-intended/35 bg-well px-1 py-px text-center font-mono text-xs font-semibold text-intended outline-none focus-visible:outline-2 focus-visible:outline-focus"
              aria-label="Fan-out cap"
            />
          </span>
        )}
      </div>
    </div>
  )
}
