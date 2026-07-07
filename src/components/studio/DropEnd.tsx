import { useEffect, useRef } from 'react'
import type { DragEvent } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { PATTERN_DND_MIME, type PatternKey } from '@/lib/patterns'
import { cn } from '@/lib/utils'

/**
 * The append slot after the last phase (mockup `.drop-end`): a dashed rounded well that
 * accepts a dropped pattern at the end of the rundown, and — as a button — opens the
 * `RepertoireSheet` on click/tap, the only path once the shelf is hidden (< 980px) and the
 * keyboard path everywhere. When the rundown has no phases at all, it doubles as the
 * empty-state message. Same hot/idempotent drop wiring as `Seam`; the copy mentions dragging
 * only at widths where the repertoire shelf actually exists.
 */
export function DropEnd({ index, empty }: { index: number; empty: boolean }) {
  const insertPattern = useWorkflowStore((s) => s.insertPattern)
  const draggingPattern = useUiStore((s) => s.draggingPattern)
  const setDragging = useUiStore((s) => s.setDragging)
  const setInsertAt = useUiStore((s) => s.setInsertAt)

  const handledRef = useRef(false)
  useEffect(() => {
    if (draggingPattern) handledRef.current = false
  }, [draggingPattern])

  const hot = draggingPattern !== null

  const onDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (handledRef.current) return
    handledRef.current = true
    const kind = (draggingPattern ??
      (e.dataTransfer.getData(PATTERN_DND_MIME) as PatternKey | '')) as PatternKey | ''
    setDragging(null)
    if (kind) insertPattern(kind, index)
  }

  return (
    <button
      type="button"
      data-testid="drop-end"
      data-hot={hot ? 'true' : 'false'}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => setInsertAt(index)}
      className={cn(
        // a button never stretches like a div, so pair each gutter margin with an explicit width
        'mt-6 ml-[48px] block w-[calc(100%-48px)] rounded-xl border-[1.5px] border-dashed border-rule px-5 py-5 text-center font-mono text-[11.5px] text-ink-faint outline-none hover:border-focus hover:bg-focus/[0.04] hover:text-focus focus-visible:outline-2 focus-visible:outline-focus md:ml-[62px] md:w-[calc(100%-62px)]',
        hot && 'border-focus bg-focus/[0.04] text-focus',
      )}
    >
      {/* the shelf exists only at ≥980px — only there may the copy speak of dragging */}
      <span className="hidden min-[980px]:inline">
        {empty ? (
          <>drag a pattern from the repertoire to start — or click to browse</>
        ) : (
          <>
            ＋ drag a pattern from the <b className="font-semibold">repertoire</b> (or click to
            browse) — its inputs wire to the phase above
          </>
        )}
      </span>
      <span className="min-[980px]:hidden">
        {empty ? (
          <>＋ add a pattern to start</>
        ) : (
          <>＋ add a pattern — its inputs wire to the phase above</>
        )}
      </span>
    </button>
  )
}
