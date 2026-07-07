import { Dialog } from '@base-ui/react/dialog'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { PATTERN_ORDER, PATTERN_INFO, PATTERN_NAME } from '@/lib/patterns'
import { PatternCardFace } from './PatternCard'
import { GlyphLegend } from './glyphs'

/**
 * The repertoire as a pick-to-insert dialog: the touch path into `insertPattern`, opened by
 * tapping a `Seam` or the `DropEnd` (which set `uiStore.insertAt` to their index). One tap
 * places the pattern at exactly that index — same store call as a drop, handoffs pre-wired.
 * On small screens it rises as a bottom sheet (thumb reach); at md+ it is a centered dialog,
 * doubling as keyboard-accessible insertion the drag-only shelf never had.
 */
export function RepertoireSheet() {
  const insertPattern = useWorkflowStore((s) => s.insertPattern)
  const insertAt = useUiStore((s) => s.insertAt)
  const setInsertAt = useUiStore((s) => s.setInsertAt)

  const open = insertAt !== null

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && setInsertAt(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/25" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex max-h-[78dvh] flex-col rounded-t-2xl border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_oklch(0_0_0/0.18)] outline-none md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[76vh] md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border md:border-rule md:pb-0 md:shadow-[0_20px_48px_oklch(0_0_0/0.18)]">
          <div className="flex items-baseline gap-2.5 px-5 pt-4 pb-2.5">
            <Dialog.Title className="m-0 font-mono text-[10px] tracking-[0.16em] text-ink-dim uppercase">
              Repertoire
            </Dialog.Title>
            <span className="font-mono text-[11px] text-ink-faint">
              insert as phase {(insertAt ?? 0) + 1} — handoffs arrive pre-wired
            </span>
            <button
              type="button"
              onClick={() => setInsertAt(null)}
              aria-label="Close"
              className="ml-auto -mr-1 rounded px-2 py-0.5 text-[15px] leading-none text-ink-faint outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              ×
            </button>
          </div>
          <GlyphLegend className="px-5 pb-3" />
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-rule-soft bg-paper-2 px-3.5 py-3.5">
            {PATTERN_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                title={PATTERN_INFO[kind].tip}
                aria-label={`Insert ${PATTERN_NAME[kind]}`}
                onClick={() => {
                  if (insertAt !== null) insertPattern(kind, insertAt)
                  setInsertAt(null)
                }}
                className="mb-[7px] block w-full rounded-[10px] border border-rule bg-paper px-2.5 py-2.5 text-left shadow-[0_1px_2px_oklch(0_0_0/0.04)] outline-none last:mb-0 hover:border-ink-faint hover:shadow-[0_3px_8px_oklch(0_0_0/0.08)] focus-visible:outline-2 focus-visible:outline-focus"
              >
                <PatternCardFace kind={kind} />
              </button>
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
