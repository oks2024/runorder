import { useWorkflowStore } from '@/store/workflowStore'
import { estimateRunSize } from '@/lib/estimate'
import { cn } from '@/lib/utils'

/** A segmented gauge bar. `variant` controls fill color (intended vs neutral estimate). */
function SegBar({
  count,
  on,
  variant,
  label,
}: {
  count: number
  on: number
  variant: 'intended' | 'neutral'
  label: string
}) {
  return (
    <div className="flex gap-[3px]" role="img" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className={cn(
            'h-3 flex-1 rounded-[2px] border',
            i < on
              ? variant === 'intended'
                ? 'border-intended bg-intended shadow-[0_0_6px_oklch(0.8_0.11_85/0.5)]'
                : 'border-ink-faint bg-ink-faint'
              : 'border-[oklch(0.36_0.02_250)] bg-[oklch(0.30_0.02_250)]',
          )}
        />
      ))}
    </div>
  )
}

function Gauge({
  name,
  children,
  estimate,
  foot,
}: {
  name: string
  children: React.ReactNode
  estimate?: boolean
  foot: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'min-w-[188px] rounded-lg border border-line-soft bg-panel px-3 py-2.5',
        estimate && 'border-dashed opacity-90',
      )}
    >
      <div className="mb-1.5 flex items-baseline justify-between font-mono text-[11px]">
        <span className="tracking-[0.08em] text-ink-dim uppercase">{name}</span>
        {children}
      </div>
      {foot}
    </div>
  )
}

const capInput =
  'w-[54px] rounded-[5px] border border-line bg-well px-1.5 py-px text-right font-mono text-[13px] font-semibold text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus'

export function CapsBand() {
  const concurrency = useWorkflowStore((s) => s.spec.caps.concurrency)
  const total = useWorkflowStore((s) => s.spec.caps.total)
  const setConcurrency = useWorkflowStore((s) => s.setConcurrency)
  const setTotal = useWorkflowStore((s) => s.setTotal)
  const est = useWorkflowStore((s) => estimateRunSize(s.spec))

  const totalSeg = Math.max(0, Math.min(12, Math.round((total / 1000) * 12)))
  const estSeg = Math.max(0, Math.min(10, est))

  return (
    <section
      className="flex items-stretch gap-3.5 overflow-x-auto border-b border-line bg-well px-[18px] py-3 shadow-[0_2px_6px_oklch(0_0_0/0.25)_inset]"
      aria-label="Workflow caps"
    >
      <div className="flex min-w-[150px] flex-col justify-center border-r border-line-soft pr-2">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-intended uppercase">
          Workflow caps
        </span>
        <span className="text-[11px] text-ink-faint">bounds for the run — intended, not enforced</span>
      </div>

      <Gauge
        name="Concurrency"
        foot={
          <div className="mt-1.5 font-mono text-[10.5px] tracking-[0.04em] text-ink-faint">
            <span className="text-intended">▮ INTENDED</span> · max parallel agents
          </div>
        }
      >
        <span className="inline-flex items-baseline gap-0.5">
          <input
            className={capInput}
            type="number"
            min={1}
            max={16}
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.valueAsNumber)}
            aria-label="Concurrency cap"
          />
          <span className="text-[11px] font-normal text-ink-faint">/ 16</span>
        </span>
      </Gauge>

      <Gauge
        name="Total cap"
        foot={
          <>
            <SegBar count={12} on={totalSeg} variant="intended" label={`Total cap ${total} of 1000`} />
            <div className="mt-1.5 font-mono text-[10.5px] tracking-[0.04em] text-ink-faint">
              <span className="text-intended">▮ INTENDED</span> · hard ceiling on agent count
            </div>
          </>
        }
      >
        <span className="inline-flex items-baseline gap-0.5">
          <input
            className={capInput}
            type="number"
            min={1}
            max={1000}
            value={total}
            onChange={(e) => setTotal(e.target.valueAsNumber)}
            aria-label="Total agent cap"
          />
          <span className="text-[11px] font-normal text-ink-faint">/ 1000</span>
        </span>
      </Gauge>

      <Gauge
        name="Est. run size"
        estimate
        foot={
          <>
            <SegBar count={10} on={estSeg} variant="neutral" label={`Estimate up to ${est} agents`} />
            <div className="mt-1.5 font-mono text-[10.5px] tracking-[0.04em] text-ink-faint">
              <span className="text-estimate">◌ ESTIMATE</span> · fan-out is dynamic-N · not a guarantee
            </div>
          </>
        }
      >
        <span className="inline-flex items-baseline gap-1">
          <span className="font-mono text-[13px] font-semibold text-ink-dim">≤ {est}</span>
          <span className="text-[11px] font-normal text-ink-faint">agents</span>
        </span>
      </Gauge>
    </section>
  )
}
