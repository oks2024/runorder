import type { CSSProperties } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { INHERIT } from '@/lib/models'
import type { Agent, PatternNode } from '@/spec/schema'
import { PhaseSentence } from './PhaseSentence'
import { PromptBlock } from './PromptBlock'
import { FlowNote } from './FlowNote'
import { hueVar } from './hue'
import { KIND_LABEL, patternKeyOf, primaryRef, type EditableNode } from './roles'

/** The agent + optional role-kicker for each prompt block a phase shows (one per agent role). */
function promptRoles(node: EditableNode): Array<{ ref: string; role?: string }> {
  switch (node.type) {
    case 'mapReduce':
      return [
        { ref: node.map.agent, role: 'mapper' },
        { ref: node.reduce, role: 'reducer' },
      ]
    case 'adversarial':
      return [
        { ref: node.producer, role: 'producer' },
        { ref: node.critic, role: 'critic' },
      ]
    case 'multiAngle':
      return [
        { ref: node.agent, role: 'taker' },
        { ref: node.vote, role: 'voter' },
      ]
    case 'agent':
      if (node.grants && node.grants[0])
        return [
          { ref: node.agent, role: 'lead' },
          { ref: node.grants[0].agent, role: 'helper' },
        ]
      return [{ ref: node.agent }]
    case 'iterateUntil':
      return node.body.type === 'agent' ? [{ ref: node.body.agent }] : []
    default:
      return [{ ref: node.agent }] // fanout
  }
}

/**
 * One numbered phase of the worksheet (mockup `.phase`): a left `.pnum` gutter (number, kind
 * label, per-phase model hue on its right border, hover-reveal remove) and a body of the
 * edit-in-place sentence, the prompt block(s), and the flow note. The phase hue is the
 * primary agent's model family.
 */
export function PhaseSection({
  node,
  index,
  count,
  phases,
}: {
  node: EditableNode
  index: number
  count: number
  phases: PatternNode[]
}) {
  const spec = useWorkflowStore((s) => s.spec)
  const removePhase = useWorkflowStore((s) => s.removePhase)

  const agentOf = (ref: string): Agent | undefined => spec.agents.find((a) => a.id === ref)
  const primary = agentOf(primaryRef(node))
  const phue = hueVar(primary?.model ?? INHERIT)
  const kind = KIND_LABEL[patternKeyOf(node)]

  const nodeId = 'id' in node ? node.id : undefined

  return (
    <section
      id={nodeId ? `phase-${nodeId}` : undefined}
      className="group mt-5 grid grid-cols-[44px_1fr] gap-x-[18px] rounded-[10px]"
      style={{ '--phue': phue } as CSSProperties}
    >
      <div
        className="border-r-2 pr-[14px] pt-[3px] text-right font-mono text-[12px] font-semibold text-ink-faint"
        style={{ borderRightColor: 'var(--phue)' }}
      >
        {index + 1}
        <span className="mt-1 block text-[9px] tracking-[0.12em] uppercase">{kind}</span>
        <button
          type="button"
          title="Remove phase"
          aria-label={`Remove phase ${index + 1}`}
          onClick={() => removePhase(index)}
          className="mt-1.5 rounded px-1 text-[13px] leading-none text-ink-faint opacity-0 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
        >
          ×
        </button>
      </div>

      <div className="min-w-0 rounded-lg px-2 pt-[2px] pb-1.5">
        <PhaseSentence node={node} index={index} phases={phases} />
        {promptRoles(node).map(({ ref, role }, i) => {
          const agent = agentOf(ref)
          const field: 'prompt' | 'prompt2' = i === 0 ? 'prompt' : 'prompt2'
          return agent ? (
            <PromptBlock
              key={`${ref}-${role ?? 'p'}`}
              agent={agent}
              role={role}
              nodeId={nodeId}
              field={field}
            />
          ) : null
        })}
        <FlowNote node={node} index={index} count={count} />
      </div>
    </section>
  )
}
