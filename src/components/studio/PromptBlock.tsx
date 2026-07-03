import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { provKey } from '@/lib/prov'
import { ProvSpan } from './ProvSpan'
import type { Agent } from '@/spec/schema'

/**
 * An agent's prompt, quoted as an editable paragraph (mockup `.prompt-block`): a controlled
 * `<textarea>` with a left rule that lights the phase hue on hover and a small uppercase
 * kicker ("prompt", or "prompt — reducer" for a role in a two-agent phase). Autosizes via
 * `field-sizing: content` with a scrollHeight effect as the fallback for engines without it.
 * `field`/`nodeId` (the phase's primary vs. secondary prompt) key it to the exact script
 * line(s) the emitter tagged with `prompt`/`prompt2` — the two-way hover with the receipt.
 */
export function PromptBlock({
  agent,
  role,
  nodeId,
  field,
}: {
  agent: Agent
  role?: string
  nodeId?: string
  field: 'prompt' | 'prompt2'
}) {
  const updateAgent = useWorkflowStore((s) => s.updateAgent)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [agent.prompt])

  return (
    <ProvSpan
      keys={nodeId ? provKey(nodeId, field) : undefined}
      as="div"
      className="mt-3 border-l-[3px] border-rule-soft pl-4 hover:[border-left-color:var(--phue)]"
    >
      <div
        className="mb-1 font-mono text-[9px] tracking-[0.16em] text-ink-faint uppercase"
        aria-hidden
      >
        {role ? `prompt — ${role}` : 'prompt'}
      </div>
      <textarea
        ref={ref}
        aria-label={role ? `prompt — ${role}` : 'prompt'}
        value={agent.prompt}
        spellCheck={false}
        rows={1}
        onChange={(e) => updateAgent(agent.id, { prompt: e.target.value })}
        className="block w-full resize-none overflow-hidden bg-transparent font-sans text-[14.5px] leading-[1.7] text-ink outline-none [field-sizing:content]"
        style={{ minHeight: '1.7em' } as CSSProperties}
      />
    </ProvSpan>
  )
}
