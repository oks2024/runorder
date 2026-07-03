import type { CSSProperties } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import type { Agent } from '@/spec/schema'

/**
 * An agent's name, edited in place inside a worksheet sentence (mockup `.agent-token`): a
 * controlled `<input>` sized by `ch` from the value. A dangling ref (no matching agent)
 * renders as a non-editable danger token showing the raw ref — never crashes the sentence.
 */
export function AgentToken({ agent, danglingRef }: { agent?: Agent; danglingRef?: string }) {
  const updateAgent = useWorkflowStore((s) => s.updateAgent)

  if (!agent) {
    return (
      <span
        className="font-mono text-[15px] font-semibold text-danger"
        title={`Unresolved agent "${danglingRef ?? '?'}" — fix the spec before running.`}
      >
        {danglingRef ?? '?'}
      </span>
    )
  }

  const ch = Math.max(agent.name.length, 2)
  return (
    <input
      aria-label="Agent name"
      value={agent.name}
      spellCheck={false}
      onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
      className="border-b border-dashed border-rule bg-transparent font-mono text-[15px] font-semibold text-ink outline-none focus:border-focus"
      style={{ width: `${ch}ch` } as CSSProperties}
    />
  )
}
