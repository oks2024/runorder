import { useEffect, useRef } from 'react'
import type { DragEvent } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { PATTERN_DND_MIME, type PatternKey } from '@/lib/patterns'
import { cn } from '@/lib/utils'

/**
 * A drop seam between (or before) phases (mockup `.seam`): a dashed rule with a "drop a
 * pattern here" label, aligned to the phase grid so it reads as an insertion point at exactly
 * this index. Lights ("hot") while *any* shelf card is being dragged — driven by the uiStore
 * flag, not `dragenter` (which bubbles noisily and, on Chromium, can't read `dataTransfer`
 * during `dragover` anyway) — or on hover/focus for mouse users not currently dragging.
 */
export function Seam({ index }: { index: number }) {
  const insertPattern = useWorkflowStore((s) => s.insertPattern)
  const draggingPattern = useUiStore((s) => s.draggingPattern)
  const setDragging = useUiStore((s) => s.setDragging)

  // Guards against a duplicate/double `drop` event inserting twice: set synchronously on the
  // first drop (before the store round-trips through a render), reset only when a *new* drag
  // starts (draggingPattern flips back to non-null).
  const handledRef = useRef(false)
  useEffect(() => {
    if (draggingPattern) handledRef.current = false
  }, [draggingPattern])

  const hot = draggingPattern !== null

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (handledRef.current) return
    handledRef.current = true
    const kind = (draggingPattern ??
      (e.dataTransfer.getData(PATTERN_DND_MIME) as PatternKey | '')) as PatternKey | ''
    setDragging(null)
    if (kind) insertPattern(kind, index)
  }

  return (
    <div
      data-testid={`seam-${index}`}
      data-hot={hot ? 'true' : 'false'}
      className="group my-1 grid grid-cols-[44px_1fr] gap-x-[18px]"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span />
      <span
        className={cn(
          'flex min-h-5 items-center gap-2.5 opacity-25 group-hover:opacity-100',
          hot && 'opacity-100',
        )}
      >
        <span
          className={cn(
            'h-0 flex-1 border-t-[1.5px] border-dashed border-rule group-hover:border-focus',
            hot && 'border-focus',
          )}
        />
        <span
          className={cn(
            'font-mono text-[10px] text-ink-faint group-hover:text-focus',
            hot && 'text-focus',
          )}
        >
          ＋ drop a pattern to insert here
        </span>
        <span
          className={cn(
            'h-0 flex-1 border-t-[1.5px] border-dashed border-rule group-hover:border-focus',
            hot && 'border-focus',
          )}
        />
      </span>
    </div>
  )
}
