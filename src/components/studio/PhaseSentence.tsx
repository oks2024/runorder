import type { ReactNode } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { deriveMemoryNames } from '@/lib/memoryNames'
import { isSchemaForced } from '@/emit/plumbing'
import { INHERIT } from '@/lib/models'
import type { Agent, PatternNode } from '@/spec/schema'
import { AgentToken } from './AgentToken'
import { ModelToken } from './ModelToken'
import { NumToken } from './NumToken'
import { EnfMark } from './EnfMark'
import type { EditableNode } from './roles'

const mem = 'rounded-[4px] border border-rule-soft bg-paper-2 px-1.5 font-mono text-[13px] font-medium text-ink-dim'

/**
 * The per-phase prose sentence with edit-in-place tokens (mockup `.pline`). One template per
 * pattern; every model/agent/number is a live token bound to the store. The enforced mark
 * appears only where the script enforces the claim: next to a pinned model, and next to the
 * literal cap/iters/angles/grant-cap numbers (guardrail #5).
 */
export function PhaseSentence({
  node,
  index,
  phases,
}: {
  node: EditableNode
  index: number
  phases: PatternNode[]
}) {
  const spec = useWorkflowStore((s) => s.spec)
  const updateAgent = useWorkflowStore((s) => s.updateAgent)
  const setFanoutCap = useWorkflowStore((s) => s.setFanoutCap)
  const setLoopMaxIter = useWorkflowStore((s) => s.setLoopMaxIter)
  const setMapCap = useWorkflowStore((s) => s.setMapCap)
  const setAngles = useWorkflowStore((s) => s.setAngles)
  const setGrantCap = useWorkflowStore((s) => s.setGrantCap)

  const agentOf = (ref: string): Agent | undefined => spec.agents.find((a) => a.id === ref)

  /** Agent-name token for a ref (danger token if dangling). */
  const A = (ref: string) => <AgentToken agent={agentOf(ref)} danglingRef={ref} />

  /** Model pill for a ref + its enforced mark (only when a model is pinned). */
  const M = (ref: string): ReactNode => {
    const agent = agentOf(ref)
    if (!agent) return null
    return (
      <>
        <ModelToken value={agent.model} onChange={(model) => updateAgent(agent.id, { model })} />
        {agent.model !== INHERIT && <EnfMark />}
      </>
    )
  }

  /** ⟨source⟩ for a fan-out/map — mirrors the emitter's `itemsExpr`. */
  const source = (): ReactNode => {
    if (index === 0) return <>the workflow args</>
    const prev = phases[index - 1]
    const prevIsArray =
      prev.type === 'fanout' || (prev.type === 'agent' && !!prev.grants && prev.grants.length > 0)
    if (isSchemaForced(phases, index - 1) || prevIsArray) {
      const name = deriveMemoryNames(spec)[index - 1]?.name ?? `phase-${index}`
      return <span className={mem}>{name}</span>
    }
    return (
      <>
        the previous output <em className="text-ink-faint italic">(split heuristically)</em>
      </>
    )
  }

  const pline = 'm-0 text-[16px]'

  switch (node.type) {
    case 'agent': {
      const grant = node.grants?.[0]
      if (grant) {
        return (
          <p className={pline}>
            {A(node.agent)} runs once on {M(node.agent)} and may delegate up to{' '}
            <NumToken
              value={grant.cap}
              min={1}
              max={16}
              label="delegation cap"
              onCommit={(n) => setGrantCap(index, n)}
            />
            <EnfMark /> sub-tasks to {A(grant.agent)} instances on {M(grant.agent)}
          </p>
        )
      }
      return (
        <p className={pline}>
          {A(node.agent)} runs once on {M(node.agent)}
        </p>
      )
    }
    case 'fanout':
      return (
        <p className={pline}>
          {A(node.agent)} runs once per item of {source()}, at most{' '}
          <NumToken
            value={node.cap}
            min={1}
            max={16}
            label="fan-out cap"
            onCommit={(n) => setFanoutCap(index, n)}
          />
          <EnfMark /> in parallel, on {M(node.agent)}
        </p>
      )
    case 'iterateUntil': {
      if (node.body.type !== 'agent') {
        return (
          <p className={`${pline} text-danger`}>
            This loop wraps a <code>{node.body.type}</code> body — V1 loops must wrap a single
            agent. Flatten it in the worksheet.
          </p>
        )
      }
      const ref = node.body.agent
      return (
        <p className={pline}>
          {A(ref)} repeats up to{' '}
          <NumToken
            value={node.maxIter}
            min={1}
            max={20}
            label="loop max iterations"
            onCommit={(n) => setLoopMaxIter(index, n)}
          />
          <EnfMark /> times on {M(ref)}, stopping early when it reports done
        </p>
      )
    }
    case 'mapReduce':
      return (
        <p className={pline}>
          {A(node.map.agent)} runs once per item of {source()}, at most{' '}
          <NumToken
            value={node.map.cap}
            min={1}
            max={16}
            label="map cap"
            onCommit={(n) => setMapCap(index, n)}
          />
          <EnfMark /> in parallel, on {M(node.map.agent)}; then {A(node.reduce)} merges every
          output into one result on {M(node.reduce)}
        </p>
      )
    case 'adversarial':
      return (
        <p className={pline}>
          {A(node.producer)} drafts on {M(node.producer)}; then {A(node.critic)} attacks the
          draft on {M(node.critic)}
        </p>
      )
    case 'multiAngle':
      return (
        <p className={pline}>
          {A(node.agent)} runs{' '}
          <NumToken
            value={node.angles}
            min={1}
            max={8}
            label="angles"
            onCommit={(n) => setAngles(index, n)}
          />
          <EnfMark /> independent takes in parallel on {M(node.agent)}; then {A(node.vote)} picks
          or synthesizes the best on {M(node.vote)}
        </p>
      )
  }
}
