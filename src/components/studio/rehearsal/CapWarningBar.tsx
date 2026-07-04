import { useWorkflowStore } from '@/store/workflowStore'
import type { CapWarning } from '@/lib/rehearse'

/** Mirrors `FANOUT_CAP_MAX` in `workflowStore.ts` (the store keeps it private) — the ceiling
 * every per-phase cap setter clamps to. */
const CAP_MAX = 16

const KIND_LABEL: Record<CapWarning['kind'], string> = {
  fanout: 'fan-out',
  mapReduce: 'map-reduce',
  delegate: 'delegation',
  verify: 'verify',
}

/**
 * One cap-drop warning (mockup `.capwarn`): "N items, the cap keeps C and drops D silently"
 * plus a "fix" button that raises the offending phase's cap to `min(incoming, 16)` — the only
 * spec write this read-only view makes. Routes by `warning.kind` to the matching store setter.
 */
export function CapWarningBar({ warning }: { warning: CapWarning }) {
  const setFanoutCap = useWorkflowStore((s) => s.setFanoutCap)
  const setMapCap = useWorkflowStore((s) => s.setMapCap)
  const setGrantCap = useWorkflowStore((s) => s.setGrantCap)
  const setVerifyCap = useWorkflowStore((s) => s.setVerifyCap)

  const target = Math.min(warning.incoming, CAP_MAX)
  const fixLabel = warning.incoming > CAP_MAX ? `raise cap to ${CAP_MAX} (max)` : `raise cap to ${target}`

  const fix = () => {
    if (warning.kind === 'fanout') setFanoutCap(warning.phaseIndex, target)
    else if (warning.kind === 'mapReduce') setMapCap(warning.phaseIndex, target)
    else if (warning.kind === 'verify') setVerifyCap(warning.phaseIndex, target)
    else setGrantCap(warning.phaseIndex, target)
  }

  return (
    <div
      className="mt-2.5 flex items-baseline gap-2.5 rounded-[10px] border px-4 py-2.5 text-[12.5px] text-ink-dim"
      style={{
        borderColor: 'color-mix(in oklch, var(--color-danger) 30%, var(--color-rule))',
        background: 'color-mix(in oklch, var(--color-danger) 4%, var(--color-paper))',
      }}
    >
      <span aria-hidden className="text-[10px] text-danger">
        ▲
      </span>
      <span>
        With {warning.incoming} items, the {KIND_LABEL[warning.kind]} cap keeps {warning.cap} and{' '}
        <b className="text-danger">drops {warning.dropped} silently</b> — the emitted script
        slices at the cap.
      </span>
      <button
        type="button"
        onClick={fix}
        className="ml-auto rounded-md border border-rule bg-paper px-2.5 py-[3px] font-mono text-[10.5px] whitespace-nowrap text-ink-dim hover:border-intended hover:text-intended"
      >
        {fixLabel}
      </button>
    </div>
  )
}
