import { TopBar } from './TopBar'
import { Worksheet } from './Worksheet'
import { ReceiptColumn } from './ReceiptColumn'

/**
 * The Studio shell (mockup `.app`): the top bar over a body of the worksheet document and the
 * optional receipt column. The pattern shelf (M2) and the rehearsal view (M3) slot in later.
 */
export function StudioApp() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper text-ink">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Worksheet />
        <ReceiptColumn />
      </div>
    </div>
  )
}
