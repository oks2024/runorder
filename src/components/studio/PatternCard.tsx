import type { DragEvent, KeyboardEvent } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { PATTERN_INFO, PATTERN_NAME, PATTERN_DND_MIME, type PatternKey } from '@/lib/patterns'
import { PATTERN_GLYPHS } from './glyphs'

/**
 * One shelf card (mockup `.pat`): topology glyph + name + one-liner. A
 * `draggable` button — dragging it out sets `dataTransfer` and flags the uiStore so drop
 * zones (`Seam`/`DropEnd`) light up; a plain click/Enter appends it at the end of the
 * rundown (keyboard/touch fallback, since HTML5 DnD has neither).
 */
export function PatternCard({ kind }: { kind: PatternKey }) {
  const insertPattern = useWorkflowStore((s) => s.insertPattern)
  const stepCount = useWorkflowStore((s) =>
    s.spec.root.type === 'sequence' ? s.spec.root.steps.length : 0,
  )
  const setDragging = useUiStore((s) => s.setDragging)
  const info = PATTERN_INFO[kind]

  const append = () => insertPattern(kind, stepCount)

  const onDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(PATTERN_DND_MIME, kind)
    e.dataTransfer.effectAllowed = 'copy'
    setDragging(kind)
  }
  const onDragEnd = () => setDragging(null)

  // Native <button> already fires onClick for Enter/Space; this just documents the intent.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter') append()
  }

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={append}
      onKeyDown={onKeyDown}
      title={info.tip}
      className="mb-[7px] grid w-full cursor-grab grid-cols-[40px_1fr] items-center gap-[9px] rounded-[10px] border border-rule bg-paper px-2.5 py-2.5 text-left shadow-[0_1px_2px_oklch(0_0_0/0.04)] outline-none last:mb-0 hover:border-ink-faint hover:shadow-[0_3px_8px_oklch(0_0_0/0.08)] focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing"
    >
      <span aria-hidden className="h-[27px] w-10 text-ink-dim [&>svg]:h-full [&>svg]:w-full">
        {PATTERN_GLYPHS[kind]}
      </span>
      <span>
        <span className="block font-mono text-[11.5px] font-semibold text-ink">
          {PATTERN_NAME[kind]}
        </span>
        <span className="block text-[10px] leading-[1.3] text-ink-faint">{info.use}</span>
      </span>
    </button>
  )
}
