import { useUiStore } from '@/store/uiStore'
import type { Rehearsal } from '@/lib/rehearse'

/**
 * The rehearsal banner (mockup `.rh-banner`): the read-only kicker, the sample-N stepper
 * (writes only `uiStore.sampleN` — never the spec), and a right-aligned tally of this
 * rehearsal's live agent count / per-tick breakdown / peak seats. Deliberately distinct
 * wording from the top-bar status pill (that one is cap-based; this one is sampleN-based).
 */
export function RehearsalBanner({
  rehearsal,
  concurrency,
}: {
  rehearsal: Rehearsal
  concurrency: number
}) {
  const sampleN = useUiStore((s) => s.sampleN)
  const setSampleN = useUiStore((s) => s.setSampleN)

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
      <span className="text-[13px] text-ink-dim">nothing runs, nothing is spent — rehearse with</span>
      <span className="inline-flex items-center">
        <button
          type="button"
          aria-label="Fewer"
          onClick={() => setSampleN(sampleN - 1)}
          className="h-6 w-6 rounded-l-md border border-rule bg-paper font-mono text-[13px] leading-none text-ink-dim"
        >
          −
        </button>
        <span className="border-y border-rule bg-paper px-[11px] py-[2px] font-mono text-[12.5px] font-semibold">
          {sampleN}
        </span>
        <button
          type="button"
          aria-label="More"
          onClick={() => setSampleN(sampleN + 1)}
          className="h-6 w-6 rounded-r-md border border-rule bg-paper font-mono text-[13px] leading-none text-ink-dim"
        >
          +
        </button>
      </span>
      <span className="text-[13px] text-ink-dim">sample findings</span>

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
