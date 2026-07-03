import { useWorkflowStore } from '@/store/workflowStore'
import { PROV_CAPS } from '@/lib/prov'
import { NumToken } from './NumToken'
import { ProvSpan } from './ProvSpan'

/**
 * The caps sentence under the masthead (mockup `.lede`): the concurrency + total caps as two
 * edit-in-place number tokens, then the phase count. Caps are *intended* bounds, so no
 * enforced mark here (the fan-out cap, which the script actually slices, gets one — not these).
 * Wrapped in a `ProvSpan` (spec-level `caps` key) so hovering the sentence lights the emitted
 * `// Caps — …` comment line, and vice versa.
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
    <ProvSpan keys={PROV_CAPS} as="p" className="-mx-1 mt-3 px-1 text-[15px] text-ink-dim">
      Run at most{' '}
      <NumToken value={concurrency} min={1} max={16} label="concurrency cap" onCommit={setConcurrency} />{' '}
      agents at once and{' '}
      <NumToken value={total} min={1} max={1000} label="total cap" onCommit={setTotal} /> in total.{' '}
      {phaseCount} phase{phaseCount === 1 ? '' : 's'}, in order.
    </ProvSpan>
  )
}
