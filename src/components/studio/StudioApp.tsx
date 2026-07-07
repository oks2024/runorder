import { useUiStore } from '@/store/uiStore'
import { TopBar } from './TopBar'
import { Shelf } from './Shelf'
import { Rundown } from './Rundown'
import { PromptBook } from './PromptBook'
import { Rehearsal } from './rehearsal/Rehearsal'
import { MobileBar } from './MobileBar'
import { RepertoireSheet } from './RepertoireSheet'

/**
 * The Studio shell (mockup `.app`): the top bar over a body of either the rundown (pattern
 * shelf + document + optional prompt-book column) or, in rehearsal view, the read-only `Rehearsal`
 * dry-run — the two bodies are mutually exclusive (mockup `.app.rehearsing .studio { display:
 * none }`), not stacked. Below md the shell gains the bottom `MobileBar` (rundown / script /
 * rehearse as full-screen modes) and `Rundown`/`PromptBook` toggle via `mobilePane` instead of
 * sharing the row. `RepertoireSheet` is the tap-to-insert path (seams/drop-end open it) — always
 * mounted, viewport-independent. `h-dvh` (not `h-screen`) so iOS's collapsing URL bar never
 * hides the bottom bar.
 */
export function StudioApp() {
  const view = useUiStore((s) => s.view)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <TopBar />
      {view === 'rehearsal' ? (
        <Rehearsal />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Shelf />
          <Rundown />
          <PromptBook />
        </div>
      )}
      <MobileBar />
      <RepertoireSheet />
    </div>
  )
}
