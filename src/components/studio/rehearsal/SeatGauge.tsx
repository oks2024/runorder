import { cn } from '@/lib/utils'

/** The store's concurrency cap max — mirrored here (rehearsal is read-only, no import needed
 * from the store's private constant) purely to bound the gauge's rendered bar count. */
const CONCURRENCY_DISPLAY_MAX = 16

/**
 * The tiny seat gauge in a tick's rail (mockup `.seatbar`): one bar per concurrency seat, the
 * first `seatsUsed` lit intended-amber, the rest paper-3. Bar count is capped at 16 (the
 * store's concurrency max) so a pathological value can't blow out the rail's width.
 */
export function SeatGauge({
  concurrency,
  seatsUsed,
}: {
  concurrency: number
  seatsUsed: number
}) {
  const n = Math.max(1, Math.min(concurrency, CONCURRENCY_DISPLAY_MAX))
  const lit = Math.min(seatsUsed, n)

  return (
    <div
      className="mt-1 ml-auto grid w-10 gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={cn('h-[5px] rounded-[1.5px]', i < lit ? 'bg-intended' : 'bg-paper-3')} />
      ))}
    </div>
  )
}
