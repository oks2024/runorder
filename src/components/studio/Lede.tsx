import { useWorkflowStore } from '@/store/workflowStore'
import { NumToken } from './NumToken'

/**
 * The caps sentence under the masthead (mockup `.lede`): the concurrency + total caps as two
 * edit-in-place number tokens, then the phase count. Caps are *intended* bounds, so no
 * enforced mark here (the fan-out cap, which the script actually slices, gets one — not these).
 */
export function Lede() {
  const concurrency = useWorkflowStore((s) => s.spec.caps.concurrency)
  const total = useWorkflowStore((s) => s.spec.caps.total)
  const setConcurrency = useWorkflowStore((s) => s.setConcurrency)
  const setTotal = useWorkflowStore((s) => s.setTotal)
  const phaseCount = useWorkflowStore((s) =>
    s.spec.root.type === 'sequence' ? s.spec.root.steps.length : 1,
  )

  return (
    <p className="mt-3 text-[15px] text-ink-dim">
      Run at most{' '}
      <NumToken value={concurrency} min={1} max={16} label="concurrency cap" onCommit={setConcurrency} />{' '}
      agents at once and{' '}
      <NumToken value={total} min={1} max={1000} label="total cap" onCommit={setTotal} /> in total.{' '}
      {phaseCount} phase{phaseCount === 1 ? '' : 's'}, in order.
    </p>
  )
}
