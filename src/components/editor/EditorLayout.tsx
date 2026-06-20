import { TopBar } from './TopBar'
import { CapsBand } from './CapsBand'
import { AgentsPane } from './AgentsPane'
import { CompositionPane } from './CompositionPane'
import { EmitPane } from './EmitPane'
import { FooterBar } from './FooterBar'

/** Mockup-7 "Console Editor" shell: topbar · caps band · three panes · footer legend. */
export function EditorLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base text-ink">
      <TopBar />
      <CapsBand />
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(320px,380px)_minmax(320px,1fr)_minmax(340px,440px)] gap-3 p-3 max-[1180px]:grid-cols-2 max-[760px]:grid-cols-1">
        <AgentsPane />
        <CompositionPane />
        <EmitPane />
      </main>
      <FooterBar />
    </div>
  )
}
