import { useWorkflowStore } from '@/store/workflowStore'
import { Pane } from './Pane'
import { AgentStrip } from './AgentStrip'

export function AgentsPane() {
  const agents = useWorkflowStore((s) => s.spec.agents)
  const addAgent = useWorkflowStore((s) => s.addAgent)

  return (
    <Pane
      code="CH·01"
      title="Agents"
      headerExtra={
        <span className="font-mono text-[10.5px] text-ink-faint">{agents.length} defined</span>
      }
    >
      {agents.map((agent, i) => (
        <AgentStrip key={agent.id} agent={agent} index={i} />
      ))}
      <button
        type="button"
        className="w-full rounded-[10px] border border-dashed border-line px-3 py-2.5 text-left font-mono text-xs text-ink-faint hover:border-ink-faint hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-focus"
        onClick={() => addAgent()}
      >
        + add agent
      </button>
    </Pane>
  )
}
