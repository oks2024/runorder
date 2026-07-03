import type { RehearsalGap } from '@/lib/rehearse'

/**
 * The handoff note between two ticks (mockup `.flow-gap`): a left-ruled mono line naming the
 * memory and how many outputs actually carried it in this rehearsal. `countLabel` is
 * self-contained (it already names the memory) — render it alone.
 */
export function FlowGapLabel({ gap }: { gap: RehearsalGap }) {
  return (
    <div className="mt-[18px] ml-[76px] border-l-2 border-rule pl-4 font-mono text-[10px] text-ink-faint">
      {gap.countLabel}
    </div>
  )
}
