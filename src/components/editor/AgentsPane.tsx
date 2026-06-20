import { useWorkflowStore } from '@/store/workflowStore'
import { Pane } from './Pane'

// Sub-step 2 fills this in (AgentStrip + ModelCombobox). Stub for the shell.
export function AgentsPane() {
  const count = useWorkflowStore((s) => s.spec.agents.length)
  return (
    <Pane
      code="CH·01"
      title="Agents"
      headerExtra={<span className="font-mono text-[10.5px] text-ink-faint">{count} defined</span>}
    >
      <p className="font-mono text-xs text-ink-faint">roster — coming next</p>
    </Pane>
  )
}
