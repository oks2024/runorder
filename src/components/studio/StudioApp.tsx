import { useUiStore } from '@/store/uiStore'
import { TopBar } from './TopBar'
import { Shelf } from './Shelf'
import { Worksheet } from './Worksheet'
import { ReceiptColumn } from './ReceiptColumn'
import { Rehearsal } from './rehearsal/Rehearsal'

/**
 * The Studio shell (mockup `.app`): the top bar over a body of either the worksheet (pattern
 * shelf + document + optional receipt column) or, in rehearsal view, the read-only `Rehearsal`
 * dry-run — the two bodies are mutually exclusive (mockup `.app.rehearsing .studio { display:
 * none }`), not stacked.
 */
export function StudioApp() {
  const view = useUiStore((s) => s.view)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper text-ink">
      <TopBar />
      {view === 'rehearsal' ? (
        <Rehearsal />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Shelf />
          <Worksheet />
          <ReceiptColumn />
        </div>
      )}
    </div>
  )
}
