import type { CSSProperties } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { INHERIT } from '@/lib/models'
import type { ProvField } from '@/lib/prov'
import type { Agent, PatternNode } from '@/spec/schema'
import { isSchemaForced } from '@/emit/plumbing'
import { PhaseSentence } from './PhaseSentence'
import { PromptBlock } from './PromptBlock'
import { FlowNote } from './FlowNote'
import { hueVar } from './hue'
import { KIND_LABEL, ioLabel, patternKeyOf, primaryRef, type EditableNode } from './roles'

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
    case 'refine':
      return [
        { ref: node.producer, role: 'drafter' },
        { ref: node.critic, role: 'judge' },
      ]
    case 'verify':
      return [{ ref: node.skeptic, role: 'skeptic' }]
    case 'branches':
      return node.branches.map((ref, k) => ({ ref, role: `branch ${k + 1}` }))
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
 * One numbered phase of the rundown (mockup `.phase`): a left `.pnum` gutter (number, kind
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
      className="group mt-5 grid grid-cols-[36px_1fr] gap-x-3 rounded-[10px] md:grid-cols-[44px_1fr] md:gap-x-[18px]"
      style={{ '--phue': phue } as CSSProperties}
    >
      <div
        className="border-r-2 pr-2 pt-[3px] text-right font-mono text-[12px] font-semibold text-ink-faint md:pr-[14px]"
        style={{ borderRightColor: 'var(--phue)' }}
      >
        {index + 1}
        {/* the kind word (e.g. MAP-REDUCE) outgrows the tighter mobile gutter; the sentence
            below still names the shape, so only md+ carries the label */}
        <span className="mt-1 hidden text-[9px] tracking-[0.12em] uppercase md:block">{kind}</span>
        <span
          title={
            isSchemaForced(phases, index)
              ? 'inputs → outputs — this phase is schema-forced to end { context, items }; the next phase consumes it as items'
              : 'inputs → outputs of this phase'
          }
          className="mt-0.5 block text-[9px] font-normal"
        >
          {ioLabel(node, phases, index)}
        </span>
        <button
          type="button"
          title="Remove phase"
          aria-label={`Remove phase ${index + 1}`}
          onClick={() => removePhase(index)}
          className="mt-1.5 rounded px-1 text-[13px] leading-none text-ink-faint opacity-0 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100 pointer-coarse:px-1.5 pointer-coarse:py-1 pointer-coarse:text-[15px] pointer-coarse:opacity-60"
        >
          ×
        </button>
      </div>

      <div className="min-w-0 rounded-lg px-2 pt-[2px] pb-1.5">
        <PhaseSentence node={node} index={index} phases={phases} />
        {promptRoles(node).map(({ ref, role }, i) => {
          const agent = agentOf(ref)
          // Matches the emitter's numbering: primary → `prompt`, every later role → `promptN`
          // (`prompt2` is the secondary of two-agent phases; branches keep counting up).
          const field: ProvField = i === 0 ? 'prompt' : `prompt${i + 1}`
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
