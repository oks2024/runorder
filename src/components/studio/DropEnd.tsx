import { useEffect, useRef } from 'react'
import type { DragEvent } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { PATTERN_DND_MIME, type PatternKey } from '@/lib/patterns'
import { cn } from '@/lib/utils'

/**
 * The append drop zone after the last phase (mockup `.drop-end`): a dashed rounded well that
 * always accepts a dropped (or clicked) pattern at the end of the rundown. When the
 * rundown has no phases at all, it doubles as the empty-state message. Same hot/idempotent
 * drop wiring as `Seam`.
 */
export function DropEnd({ index, empty }: { index: number; empty: boolean }) {
  const insertPattern = useWorkflowStore((s) => s.insertPattern)
  const draggingPattern = useUiStore((s) => s.draggingPattern)
  const setDragging = useUiStore((s) => s.setDragging)

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
      data-testid="drop-end"
      data-hot={hot ? 'true' : 'false'}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'mt-6 ml-[62px] rounded-xl border-[1.5px] border-dashed border-rule px-5 py-5 text-center font-mono text-[11.5px] text-ink-faint hover:border-focus hover:bg-focus/[0.04] hover:text-focus',
        hot && 'border-focus bg-focus/[0.04] text-focus',
      )}
    >
      {empty ? (
        <>drag a pattern from the repertoire to start</>
      ) : (
        <>
          ＋ drag a pattern from the <b className="font-semibold">repertoire</b> — its inputs wire
          to the phase above
        </>
      )}
    </div>
  )
}
