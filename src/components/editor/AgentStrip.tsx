import { useWorkflowStore } from '@/store/workflowStore'
import type { Agent } from '@/spec/schema'
import { hueVar } from './hue'
import { ModelCombobox } from './ModelCombobox'

const fieldLabel = 'mt-2.5 mb-1 font-mono text-[9.5px] tracking-[0.12em] text-ink-faint uppercase'

/** One editable agent in the roster: name, model (combobox), prompt. Hue tracks the model. */
export function AgentStrip({ agent, index }: { agent: Agent; index: number }) {
  const updateAgent = useWorkflowStore((s) => s.updateAgent)
  const removeAgent = useWorkflowStore((s) => s.removeAgent)

  return (
    <article
      className="relative mb-3 rounded-[10px] border border-line-soft border-l-[3px] bg-gradient-to-b from-panel2 to-panel p-3 focus-within:outline-2 focus-within:outline-focus"
      style={{ borderLeftColor: hueVar(agent.model) }}
    >
      <div className="flex items-center gap-2">
        <span className="rounded border border-line px-1.5 py-px font-mono text-[10px] text-ink-faint">
          #{index + 1}
        </span>
        <input
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-mono text-[13px] font-semibold text-ink outline-none hover:border-line focus-visible:outline-2 focus-visible:outline-focus"
          value={agent.name}
          onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
          aria-label="Agent name"
        />
        <button
          type="button"
          className="ml-auto rounded-[5px] border border-transparent px-1.5 py-0.5 font-mono text-[11px] text-ink-faint hover:border-danger/45 hover:text-danger"
          onClick={() => removeAgent(agent.id)}
          title="Remove agent"
        >
          remove
        </button>
      </div>

      <div className={`${fieldLabel} flex items-center gap-2`}>
        Model
        <span
          className="inline-flex items-center gap-1 rounded-[5px] border border-enforced/40 bg-enforced/10 px-1.5 py-px text-[9px] font-semibold tracking-[0.12em] text-enforced uppercase"
          title="Model is runtime-pinned by Claude Code"
        >
          <span className="size-[5px] rounded-full bg-enforced shadow-[0_0_6px_var(--color-enforced)]" />
          Enforced
        </span>
      </div>
      <ModelCombobox value={agent.model} onChange={(model) => updateAgent(agent.id, { model })} />

      <div className={`${fieldLabel} flex items-baseline gap-2`}>
        Prompt
        <span
          className="normal-case tracking-normal"
          title="Write only what this agent should do. Context reads, the fan-out item, and any forced output schema are appended at emit time — see the Emit pane."
        >
          · plumbing appended at emit
        </span>
      </div>
      <textarea
        className="min-h-[64px] w-full resize-y rounded-md border border-line bg-well px-2 py-1.5 text-[13px] leading-relaxed text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
        value={agent.prompt}
        onChange={(e) => updateAgent(agent.id, { prompt: e.target.value })}
        aria-label="Agent prompt"
      />
    </article>
  )
}
