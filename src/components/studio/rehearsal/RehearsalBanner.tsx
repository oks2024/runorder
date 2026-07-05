import type { Rehearsal } from '@/lib/rehearse'

/**
 * The rehearsal banner (mockup `.rh-banner`): the read-only kicker plus a right-aligned tally
 * of this rehearsal's agent count / per-tick breakdown / peak seats. The rehearsal instantiates
 * every capped pattern at its cap ceiling, so this count matches the top-bar cap-based estimate.
 */
export function RehearsalBanner({
  rehearsal,
  concurrency,
}: {
  rehearsal: Rehearsal
  concurrency: number
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3.5 rounded-[10px] border px-[18px] py-3"
      style={{
        borderColor: 'color-mix(in oklch, var(--color-intended) 35%, var(--color-rule))',
        background: 'color-mix(in oklch, var(--color-intended) 5%, var(--color-paper))',
      }}
    >
      <span className="font-mono text-[9.5px] font-semibold tracking-[0.16em] text-intended uppercase">
        Rehearsal · read-only
      </span>
      <span className="text-[13px] text-ink-dim">
        nothing runs, nothing is spent — this is the run at its cap ceiling.
      </span>

      <span className="ml-auto font-mono text-[10.5px] text-ink-faint">
        <b className="text-ink">{rehearsal.totalAgents} agents</b>
        {' · '}
        <span>{rehearsal.breakdown}</span>
        {' · '}
        <b className="text-ink">
          peak {rehearsal.peakSeats}/{concurrency}
        </b>
      </span>
    </div>
  )
}
