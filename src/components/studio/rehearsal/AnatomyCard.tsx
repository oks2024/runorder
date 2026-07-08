import type { ReactNode } from 'react'
import { useUiStore } from '@/store/uiStore'
import type { ReceiveSegment, RehearsalInstance } from '@/lib/rehearse'

/** Floating segment tag (mockup `.seg .tag`): a small uppercase label straddling the
 * segment's top border, tinted to that segment's color. */
function SegTag({ colorVar, children }: { colorVar: string; children: ReactNode }) {
  return (
    <span
      className="absolute -top-[7px] left-2.5 rounded px-1.5 font-mono text-[8px] tracking-[0.1em] uppercase"
      style={{
        background: 'var(--color-paper)',
        color: colorVar,
        border: `1px solid color-mix(in oklch, ${colorVar} 30%, var(--color-rule))`,
      }}
    >
      {children}
    </span>
  )
}

/** One `receives` segment rendered as a mockup `.seg` block (mockup `.seg.sys/.read/.item/.task`
 * + the trailing `.returns` row). Every fact shown here comes straight from the segment —
 * nothing is re-derived or invented in this component. */
function Segment({ seg }: { seg: ReceiveSegment }) {
  switch (seg.kind) {
    case 'system': {
      const enforced = /enforced/i.test(seg.text)
      return (
        <div
          className="relative mb-2 rounded-lg px-3.5 py-2.5 font-mono text-[11px] text-ink-dim"
          style={{ border: '1px solid color-mix(in oklch, var(--color-enforced) 30%, var(--color-rule))' }}
        >
          <SegTag colorVar="var(--color-enforced)">{enforced ? 'enforced' : 'system'}</SegTag>
          {seg.text}
        </div>
      )
    }
    case 'input':
      return (
        <div
          className="relative mb-2 rounded-lg px-3.5 py-2.5"
          style={{
            background: 'color-mix(in oklch, var(--color-intended) 4%, var(--color-paper))',
            border: '1px solid color-mix(in oklch, var(--color-intended) 25%, var(--color-rule))',
          }}
        >
          <SegTag colorVar="var(--color-intended)">[{seg.label}] — launch input (args)</SegTag>
          <p className="m-0 text-[12px] text-ink-dim italic">{seg.placeholder}</p>
          <span className="mt-1.5 block font-mono text-[9px] text-ink-faint">
            {seg.description
              ? `you pass this when you launch — ${seg.description}`
              : 'you pass this when you launch the workflow'}
          </span>
        </div>
      )
    case 'read':
      return (
        <div
          className="relative mb-2 rounded-lg px-3.5 py-2.5"
          style={{
            background: 'color-mix(in oklch, var(--color-opus) 4%, var(--color-paper))',
            border: '1px solid color-mix(in oklch, var(--color-opus) 25%, var(--color-rule))',
          }}
        >
          <SegTag colorVar="var(--color-opus)">
            [{seg.memoryName}] — read, from {seg.fromAgent}
          </SegTag>
          <p className="m-0 text-[12px] text-ink-dim italic">{seg.placeholder}</p>
          <span className="mt-1.5 block font-mono text-[9px] text-ink-faint">{seg.source}</span>
        </div>
      )
    case 'item':
      return (
        <div
          className="relative mb-2 rounded-lg px-3.5 py-2.5"
          style={{
            background: 'color-mix(in oklch, var(--color-sonnet) 4%, var(--color-paper))',
            border: '1px solid color-mix(in oklch, var(--color-sonnet) 25%, var(--color-rule))',
          }}
        >
          <SegTag colorVar="var(--color-sonnet)">
            item {seg.index} of {seg.total} — this worker's slice
          </SegTag>
          <p className="m-0 text-[12px] text-ink-dim italic">{seg.placeholder}</p>
          <span className="mt-1.5 block font-mono text-[9px] text-ink-faint">{seg.source}</span>
        </div>
      )
    case 'prompt':
      return (
        <div className="relative mb-2 rounded-lg border border-rule px-3.5 py-2.5">
          <SegTag colorVar="var(--color-ink-faint)">your prompt</SegTag>
          <p className="m-0">{seg.text}</p>
        </div>
      )
    case 'returns':
      return (
        <div className="mt-2.5 flex items-baseline gap-2 font-mono text-[10px] text-ink-faint">
          <span>must return →</span>
          <span
            className="rounded-[5px] px-1.5 text-enforced"
            style={{ border: '1px solid color-mix(in oklch, var(--color-enforced) 30%, var(--color-rule))' }}
          >
            {seg.shape}
          </span>
          <span>· collected into</span>
          <span
            className="rounded-[5px] px-1.5 text-enforced"
            style={{ border: '1px solid color-mix(in oklch, var(--color-enforced) 30%, var(--color-rule))' }}
          >
            {seg.collectedInto}
          </span>
        </div>
      )
  }
}

/**
 * The anatomy card (mockup `.anatomy`): "exactly what it receives" for the currently-selected
 * swarm worker — its `receives` segments in order, plus an "edit in rundown ▸" jump back to
 * the phase that produced it (by DOM id `phase-{nodeId}`, set on `PhaseSection`).
 */
export function AnatomyCard({
  instance,
  nodeId,
}: {
  instance: RehearsalInstance
  nodeId?: string
}) {
  const setView = useUiStore((s) => s.setView)

  const editInRundown = () => {
    setView('rundown')
    if (!nodeId) return
    requestAnimationFrame(() => {
      document.getElementById(`phase-${nodeId}`)?.scrollIntoView({ block: 'center' })
    })
  }

  return (
    <div
      data-testid="anatomy-card"
      className="col-start-2 mt-2.5 overflow-hidden rounded-xl border bg-paper shadow-[0_2px_8px_oklch(0_0_0/0.05)]"
      style={{ borderColor: 'color-mix(in oklch, var(--color-sonnet) 35%, var(--color-rule))' }}
    >
      <div className="flex items-center gap-2.5 border-b border-rule-soft px-4 py-2.5">
        <span
          data-testid="anatomy-header"
          className="font-mono text-[10px] tracking-[0.12em] text-ink-dim uppercase"
        >
          {instance.agentName} {instance.n != null && <b className="text-ink">#{instance.n}</b>} —
          exactly what it receives
        </span>
        <button
          type="button"
          onClick={editInRundown}
          className="ml-auto rounded-md px-2.5 py-[3px] font-mono text-[10.5px] text-sonnet"
          style={{ border: '1px solid color-mix(in oklch, var(--color-sonnet) 35%, var(--color-rule))' }}
        >
          edit in rundown ▸
        </button>
      </div>
      <div className="px-4 pt-3.5 pb-4 text-[13px] leading-[1.6]">
        {instance.receives.map((s, i) => (
          <Segment key={i} seg={s} />
        ))}
      </div>
    </div>
  )
}
