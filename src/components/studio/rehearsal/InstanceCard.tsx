import type { CSSProperties } from 'react'
import { INHERIT } from '@/lib/models'
import { hueVar, shortModel } from '../hue'
import type { ReceiveSegment, RehearsalInstance } from '@/lib/rehearse'
import { cn } from '@/lib/utils'

function seg<K extends ReceiveSegment['kind']>(
  receives: ReceiveSegment[],
  kind: K,
): Extract<ReceiveSegment, { kind: K }> | undefined {
  return receives.find((s): s is Extract<ReceiveSegment, { kind: K }> => s.kind === kind)
}

/** The compact one-line "gets" summary (mockup `.inst .gets`): what this worker receives and
 * where its output goes, built from its `receives` segments — never invented. */
function getsLine(instance: RehearsalInstance): string {
  const input = seg(instance.receives, 'input')
  const read = seg(instance.receives, 'read')
  const item = seg(instance.receives, 'item')
  const returns = seg(instance.receives, 'returns')

  const parts: string[] = []
  if (input) parts.push(`the launch input [${input.label}]`)
  if (read) parts.push(`[${read.memoryName}]`)
  if (item) parts.push(`item ${item.index} of ${item.total}`)
  if (parts.length === 0) parts.push('the task prompt')

  let line = `receives: ${parts.join(' + ')}`
  if (returns) {
    line += ` · returns ${returns.shape.replace(' (runtime-enforced)', '')} → ${returns.collectedInto}`
  }
  return line
}

/**
 * One worker/instance card (mockup `.inst`): a hue dot + agent name + optional `#n`, a
 * right-aligned model badge ("enforced" when pinned, "session model" when not — guardrail #5,
 * never claim enforcement for `inherit`), and the mono gets-line. `compact` (the swarm grid)
 * tightens padding and drops the model badge — it doesn't fit a 150px card and the swarm
 * shares one model anyway (the anatomy card states it, enforced, for the whole swarm).
 */
export function InstanceCard({
  instance,
  compact,
  isHero,
  onClick,
}: {
  instance: RehearsalInstance
  compact?: boolean
  isHero?: boolean
  onClick?: () => void
}) {
  const hue = hueVar(instance.model)
  const pinned = instance.model !== INHERIT
  const clickable = !!onClick

  const style: CSSProperties = { '--hue': hue } as CSSProperties
  if (isHero) {
    style.borderColor = `color-mix(in oklch, ${hue} 50%, var(--color-rule))`
    style.boxShadow = `0 0 0 1px color-mix(in oklch, ${hue} 35%, transparent), 0 1px 2px oklch(0 0 0 / 0.04)`
  }

  const content = (
    <>
      <div className="flex items-center gap-2 font-mono text-xs">
        <span
          aria-hidden
          className="inline-block size-2 flex-none rounded-full"
          style={{ background: 'var(--hue)' }}
        />
        <b className="font-semibold">{instance.agentName}</b>
        {instance.n != null && <span className="text-ink-faint">#{instance.n}</span>}
        {!compact && (
          <span className="ml-auto text-[10px] text-ink-faint">
            {pinned ? `${shortModel(instance.model)} · enforced` : 'session model'}
          </span>
        )}
      </div>
      <span className="mt-[3px] block font-mono text-[9.5px] text-ink-faint">
        {getsLine(instance)}
      </span>
    </>
  )

  const className = cn(
    'w-full rounded-[10px] border border-rule bg-paper text-left shadow-[0_1px_2px_oklch(0_0_0/0.04)]',
    compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5',
  )

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={!!isHero}
        style={style}
        className={className}
      >
        {content}
      </button>
    )
  }
  return (
    <div style={style} className={className}>
      {content}
    </div>
  )
}
