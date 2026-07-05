import type { CSSProperties } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import type { Agent } from '@/spec/schema'
import { shortModel } from './hue'

/**
 * An agent's name, edited in place inside a rundown sentence (mockup `.agent-token`): a
 * controlled `<input>` sized by `ch` from the value. A dangling ref (no matching agent)
 * renders as a non-editable danger token showing the raw ref — never crashes the sentence.
 *
 * When `otherAgents`/`onRetarget` are given, the token also gets a hover/focus-revealed "▾"
 * retarget affordance — a native `<select>` (same lightweight pattern as `FlowNote`'s "+
 * read…" picker) listing the other agents currently referenced anywhere in the workflow.
 * Picking one calls `onRetarget`, which the caller (`PhaseSentence`) has already bound to
 * either `setPhaseAgent` or `setPhaseSecondaryAgent` depending on which role this token plays;
 * the store's GC then reclaims the agent this token used to point at if nothing else refers to
 * it — that's the intended behavior, not a bug to route around here.
 */
export function AgentToken({
  agent,
  danglingRef,
  otherAgents,
  onRetarget,
}: {
  agent?: Agent
  danglingRef?: string
  otherAgents?: Agent[]
  onRetarget?: (id: string) => void
}) {
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
  const canRetarget = !!onRetarget && !!otherAgents && otherAgents.length > 0

  return (
    <span className="group/agent inline-flex items-baseline">
      <input
        aria-label="Agent name"
        value={agent.name}
        spellCheck={false}
        onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
        className="border-b border-dashed border-rule bg-transparent font-mono text-[15px] font-semibold text-ink outline-none focus:border-focus"
        style={{ width: `${ch}ch` } as CSSProperties}
      />
      {canRetarget && (
        <select
          aria-label={`Retarget ${agent.name} to another agent`}
          title="Point this role at a different, already-referenced agent"
          value=""
          onChange={(e) => {
            if (e.target.value) onRetarget!(e.target.value)
          }}
          // fixed width + appearance-none: a native select otherwise sizes itself to its
          // widest option and (even at opacity 0) that width would tear the sentence apart
          className="ml-0.5 w-[14px] cursor-pointer appearance-none rounded border-none bg-transparent p-0 text-center font-mono text-[11px] leading-none text-ink-faint opacity-0 outline-none group-hover/agent:opacity-100 group-focus-within/agent:opacity-100 hover:text-ink-dim focus-visible:opacity-100"
        >
          <option value="">▾</option>
          {otherAgents!.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {shortModel(a.model)}
            </option>
          ))}
        </select>
      )}
    </span>
  )
}
