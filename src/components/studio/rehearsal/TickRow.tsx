import type { RehearsalTick } from '@/lib/rehearse'
import { SeatGauge } from './SeatGauge'
import { InstanceCard } from './InstanceCard'
import { Swarm } from './Swarm'
import { AnatomyCard } from './AnatomyCard'

/**
 * One tick's row (mockup `.tick`): a left rail (label, seats-used/cap, `SeatGauge`, a queued
 * caveat when concurrency-bound work waits rather than drops, and a loop's bounded/sequential
 * note) beside either a single `InstanceCard` (step/loop/lead/etc.) or a `Swarm` grid. When
 * this tick holds the selected anatomy subject, its `AnatomyCard` renders directly under the
 * swarm — never for a non-swarm tick, there's nothing to compare it against.
 */
export function TickRow({
  tick,
  tickIndex,
  concurrency,
  heroTickIndex,
  heroInstanceIndex,
  onSelectHero,
}: {
  tick: RehearsalTick
  tickIndex: number
  concurrency: number
  heroTickIndex: number | null
  heroInstanceIndex: number
  onSelectHero: (tickIndex: number, instanceIndex: number) => void
}) {
  const isSwarm = tick.instances.length > 1
  const isHeroTick = isSwarm && heroTickIndex === tickIndex

  return (
    <div className="mt-[30px] grid grid-cols-[60px_1fr] gap-4">
      <div className="text-right">
        <div className="font-mono text-[10px] tracking-[0.12em] text-ink-faint">{tick.label}</div>
        <div className="mt-1 font-mono text-[9px] text-ink-faint">
          seats <b className="text-intended">{tick.seatsUsed}</b>/{concurrency}
        </div>
        <SeatGauge concurrency={concurrency} seatsUsed={tick.seatsUsed} />
        {tick.queued > 0 && (
          <div className="mt-1 font-mono text-[9px] text-ink-faint">+{tick.queued} queued</div>
        )}
        {tick.note && (
          <div className="mt-1 font-mono text-[9px] text-ink-faint italic">{tick.note}</div>
        )}
      </div>

      <div>
        {isSwarm ? (
          <>
            <Swarm
              instances={tick.instances}
              heroIndex={isHeroTick ? heroInstanceIndex : null}
              onSelect={(i) => onSelectHero(tickIndex, i)}
            />
            {isHeroTick && (
              <AnatomyCard instance={tick.instances[heroInstanceIndex]} nodeId={tick.nodeId} />
            )}
          </>
        ) : (
          <InstanceCard instance={tick.instances[0]} />
        )}
      </div>
    </div>
  )
}
