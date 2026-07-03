import { TopBar } from './TopBar'
import { Shelf } from './Shelf'
import { Worksheet } from './Worksheet'
import { ReceiptColumn } from './ReceiptColumn'

/**
 * The Studio shell (mockup `.app`): the top bar over a body of the pattern shelf, the
 * worksheet document, and the optional receipt column. The rehearsal view (M3) slots in later
 * as a sibling that replaces this body while the top-bar switch is on "Rehearsal".
 */
export function StudioApp() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper text-ink">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Shelf />
        <Worksheet />
        <ReceiptColumn />
      </div>
    </div>
  )
}
