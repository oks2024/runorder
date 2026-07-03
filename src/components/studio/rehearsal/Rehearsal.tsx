import { useMemo, useState } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { rehearse } from '@/lib/rehearse'
import type { RehearsalTick } from '@/lib/rehearse'
import { RehearsalBanner } from './RehearsalBanner'
import { CapWarningBar } from './CapWarningBar'
import { TickRow } from './TickRow'
import { FlowGapLabel } from './FlowGapLabel'

/** The first tick with more than one instance (a genuine parallel swarm) — the mockup's
 * anatomy subject always starts on the first fan-out/map/vote/delegate swarm the run hits. */
function firstSwarmTickIndex(ticks: RehearsalTick[]): number | null {
  const i = ticks.findIndex((t) => t.instances.length > 1)
  return i === -1 ? null : i
}

/** The `min(3, live)`-th live worker (1-based) of a tick, by its index into `instances` —
 * mirrors the mockup's default anatomy subject (worker #3 of the seed's 8 live). */
function defaultHeroInstanceIndex(tick: RehearsalTick | undefined): number {
  if (!tick) return 0
  const liveIndices = tick.instances
    .map((inst, i) => (inst.dropped ? -1 : i))
    .filter((i) => i >= 0)
  if (liveIndices.length === 0) return 0
  const k = Math.min(3, liveIndices.length)
  return liveIndices[k - 1]
}

/**
 * The read-only rehearsal view (mockup `.rehearsal`/`.rh`): a truthful dry-run of the current
 * spec at a sample fan-out size, instantiated tick by tick via `rehearse`. Nothing here edits
 * the spec except the cap-warning "fix" button (routed inside `CapWarningBar`).
 */
export function Rehearsal() {
  const spec = useWorkflowStore((s) => s.spec)
  const sampleN = useUiStore((s) => s.sampleN)

  const rehearsal = useMemo(() => rehearse(spec, sampleN), [spec, sampleN])

  const [hero, setHero] = useState<{ tickIndex: number; instanceIndex: number } | null>(null)

  // A user selection is only honored while it still points at a live swarm instance. If the
  // rehearsal reshapes (sample size or spec edit) and the selection no longer resolves, fall
  // back to the default anatomy subject rather than risk a stale/out-of-range index — derived
  // at render time so no effect (and no cascading extra render) is needed.
  const selectedTick = hero ? rehearsal.ticks[hero.tickIndex] : undefined
  const selectionValid =
    !!hero &&
    !!selectedTick &&
    selectedTick.instances.length > 1 &&
    hero.instanceIndex < selectedTick.instances.length &&
    !selectedTick.instances[hero.instanceIndex].dropped

  const defaultTickIndex = firstSwarmTickIndex(rehearsal.ticks)
  const effectiveHero = selectionValid
    ? hero
    : defaultTickIndex === null
      ? null
      : {
          tickIndex: defaultTickIndex,
          instanceIndex: defaultHeroInstanceIndex(rehearsal.ticks[defaultTickIndex]),
        }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-7 pt-9 pb-24">
        <RehearsalBanner rehearsal={rehearsal} concurrency={spec.caps.concurrency} />

        {rehearsal.capWarnings.map((w) => (
          <CapWarningBar key={`${w.phaseIndex}-${w.kind}`} warning={w} />
        ))}

        {rehearsal.ticks.map((tick, i) => (
          <div key={tick.label}>
            <TickRow
              tick={tick}
              tickIndex={i}
              concurrency={spec.caps.concurrency}
              heroTickIndex={effectiveHero?.tickIndex ?? null}
              heroInstanceIndex={effectiveHero?.instanceIndex ?? 0}
              onSelectHero={(tickIndex, instanceIndex) => setHero({ tickIndex, instanceIndex })}
            />
            {rehearsal.gaps
              .filter((g) => g.afterTickIndex === i)
              .map((g) => (
                <FlowGapLabel key={g.memoryName} gap={g} />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
