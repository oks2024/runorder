import { useEffect, useRef } from 'react'
import type { DragEvent } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { PATTERN_DND_MIME, type PatternKey } from '@/lib/patterns'
import { cn } from '@/lib/utils'

/**
 * A drop seam between (or before) phases (mockup `.seam`): a dashed rule with an "insert a
 * pattern here" label, aligned to the phase grid so it reads as an insertion point at exactly
 * this index. Lights ("hot") while *any* shelf card is being dragged — driven by the uiStore
 * flag, not `dragenter` (which bubbles noisily and, on Chromium, can't read `dataTransfer`
 * during `dragover` anyway) — or on hover/focus for mouse users not currently dragging.
 * The label row is also a button opening the `RepertoireSheet` at this index — the only
 * insertion path on touch (no HTML5 DnD there), and a keyboard-reachable one everywhere; on
 * coarse pointers the seam stays visible instead of waiting for a hover that never comes.
 */
export function Seam({ index }: { index: number }) {
  const insertPattern = useWorkflowStore((s) => s.insertPattern)
  const draggingPattern = useUiStore((s) => s.draggingPattern)
  const setDragging = useUiStore((s) => s.setDragging)
  const setInsertAt = useUiStore((s) => s.setInsertAt)

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
      className="group my-1 grid grid-cols-[36px_1fr] gap-x-3 md:grid-cols-[44px_1fr] md:gap-x-[18px]"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span />
      <button
        type="button"
        aria-label={`Insert a pattern as phase ${index + 1}`}
        onClick={() => setInsertAt(index)}
        className={cn(
          'flex min-h-5 w-full items-center gap-2.5 rounded-sm opacity-25 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:min-h-10 pointer-coarse:opacity-70',
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
          {hot ? '＋ drop to insert here' : '＋ insert a pattern here'}
        </span>
        <span
          className={cn(
            'h-0 flex-1 border-t-[1.5px] border-dashed border-rule group-hover:border-focus',
            hot && 'border-focus',
          )}
        />
      </button>
    </div>
  )
}
