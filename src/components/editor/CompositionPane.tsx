import { Pane } from './Pane'

// Sub-step 3 fills this in (PhaseRow + AgentSelect). Stub for the shell.
export function CompositionPane() {
  return (
    <Pane
      code="CH·02"
      title="Composition"
      headerExtra={
        <span
          className="rounded-[5px] border border-dashed border-line px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-ink-faint uppercase"
          title="The derived block-diagram / graph projection lands in V1.1"
        >
          ▦ diagram · V1.1
        </span>
      }
    >
      <p className="font-mono text-xs text-ink-faint">phase list — coming next</p>
    </Pane>
  )
}
