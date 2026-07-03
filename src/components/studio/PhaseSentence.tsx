import type { ReactNode } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { deriveMemoryNames } from '@/lib/memoryNames'
import { isSchemaForced } from '@/emit/plumbing'
import { referencedAgentIds } from '@/lib/nodeRoles'
import { INHERIT } from '@/lib/models'
import { provKey, type ProvField } from '@/lib/prov'
import type { Agent, PatternNode } from '@/spec/schema'
import { AgentToken } from './AgentToken'
import { ModelToken } from './ModelToken'
import { NumToken } from './NumToken'
import { EnfMark } from './EnfMark'
import { ProvSpan } from './ProvSpan'
import type { EditableNode } from './roles'

const mem = 'rounded-[4px] border border-rule-soft bg-paper-2 px-1.5 font-mono text-[13px] font-medium text-ink-dim'

/**
 * The per-phase prose sentence with edit-in-place tokens (mockup `.pline`). One template per
 * pattern; every model/agent/number is a live token bound to the store. The enforced mark
 * appears only where the script enforces the claim: next to a pinned model, and next to the
 * literal cap/iters/angles/grant-cap numbers (guardrail #5). Each of those tokens is also
 * wrapped in a `ProvSpan` keyed to the exact field the emitter tagged on its line(s) — the
 * two-way hover between this sentence and the receipt column.
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
  const setPhaseAgent = useWorkflowStore((s) => s.setPhaseAgent)
  const setPhaseSecondaryAgent = useWorkflowStore((s) => s.setPhaseSecondaryAgent)
  const setFanoutCap = useWorkflowStore((s) => s.setFanoutCap)
  const setLoopMaxIter = useWorkflowStore((s) => s.setLoopMaxIter)
  const setMapCap = useWorkflowStore((s) => s.setMapCap)
  const setAngles = useWorkflowStore((s) => s.setAngles)
  const setGrantCap = useWorkflowStore((s) => s.setGrantCap)

  const nodeId = 'id' in node ? node.id : undefined
  /** This phase's provenance key for `field`, or undefined for an id-less node — never tag a
   *  field the emitter itself couldn't tag (guardrail #5). */
  const key = (field: ProvField) => (nodeId ? provKey(nodeId, field) : undefined)

  const agentOf = (ref: string): Agent | undefined => spec.agents.find((a) => a.id === ref)

  // Every agent referenced anywhere in the workflow, for the token's "▾ retarget" dropdown —
  // it offers the *other* referenced agents, never the roster's unreferenced ghosts.
  const referencedIds = referencedAgentIds(spec)
  const referencedAgents = spec.agents.filter((a) => referencedIds.has(a.id))

  /**
   * Agent-name token for a ref (danger token if dangling). `role` says which store setter a
   * retarget through this token should call — the phase's primary role (step/fan-out agent,
   * loop body, map/producer/taker/lead) or its secondary role (reduce/critic/vote/grant).
   */
  const A = (ref: string, role: 'primary' | 'secondary' = 'primary') => {
    const agent = agentOf(ref)
    const otherAgents = agent ? referencedAgents.filter((a) => a.id !== agent.id) : undefined
    const onRetarget = (id: string) =>
      role === 'primary' ? setPhaseAgent(index, id) : setPhaseSecondaryAgent(index, id)
    return (
      <AgentToken
        agent={agent}
        danglingRef={ref}
        otherAgents={otherAgents}
        onRetarget={onRetarget}
      />
    )
  }

  /** Model pill for a ref + its enforced mark, wrapped in the phase's `model`/`model2`
   *  provenance key so hovering it lights the exact script line(s) that name this model. */
  const M = (ref: string, field: 'model' | 'model2'): ReactNode => {
    const agent = agentOf(ref)
    if (!agent) return null
    return (
      <ProvSpan keys={key(field)}>
        <ModelToken value={agent.model} onChange={(model) => updateAgent(agent.id, { model })} />
        {agent.model !== INHERIT && <EnfMark />}
      </ProvSpan>
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
            {A(node.agent)} runs once on {M(node.agent, 'model')} and may delegate up to{' '}
            <ProvSpan keys={key('grant-cap')}>
              <NumToken
                value={grant.cap}
                min={1}
                max={16}
                label="delegation cap"
                onCommit={(n) => setGrantCap(index, n)}
              />
              <EnfMark />
            </ProvSpan>{' '}
            sub-tasks to {A(grant.agent, 'secondary')} instances on {M(grant.agent, 'model2')}
          </p>
        )
      }
      return (
        <p className={pline}>
          {A(node.agent)} runs once on {M(node.agent, 'model')}
        </p>
      )
    }
    case 'fanout':
      return (
        <p className={pline}>
          {A(node.agent)} runs once per item of {source()}, at most{' '}
          <ProvSpan keys={key('cap')}>
            <NumToken
              value={node.cap}
              min={1}
              max={16}
              label="fan-out cap"
              onCommit={(n) => setFanoutCap(index, n)}
            />
            <EnfMark />
          </ProvSpan>{' '}
          in parallel, on {M(node.agent, 'model')}
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
          <ProvSpan keys={key('iters')}>
            <NumToken
              value={node.maxIter}
              min={1}
              max={20}
              label="loop max iterations"
              onCommit={(n) => setLoopMaxIter(index, n)}
            />
            <EnfMark />
          </ProvSpan>{' '}
          times on {M(ref, 'model')}, stopping early when it reports done
        </p>
      )
    }
    case 'mapReduce':
      return (
        <p className={pline}>
          {A(node.map.agent)} runs once per item of {source()}, at most{' '}
          <ProvSpan keys={key('cap')}>
            <NumToken
              value={node.map.cap}
              min={1}
              max={16}
              label="map cap"
              onCommit={(n) => setMapCap(index, n)}
            />
            <EnfMark />
          </ProvSpan>{' '}
          in parallel, on {M(node.map.agent, 'model')}; then {A(node.reduce, 'secondary')} merges
          every output into one result on {M(node.reduce, 'model2')}
        </p>
      )
    case 'adversarial':
      return (
        <p className={pline}>
          {A(node.producer)} drafts on {M(node.producer, 'model')}; then{' '}
          {A(node.critic, 'secondary')} attacks the draft on {M(node.critic, 'model2')}
        </p>
      )
    case 'multiAngle':
      return (
        <p className={pline}>
          {A(node.agent)} runs{' '}
          <ProvSpan keys={key('angles')}>
            <NumToken
              value={node.angles}
              min={1}
              max={8}
              label="angles"
              onCommit={(n) => setAngles(index, n)}
            />
            <EnfMark />
          </ProvSpan>{' '}
          independent takes in parallel on {M(node.agent, 'model')}; then{' '}
          {A(node.vote, 'secondary')} picks or synthesizes the best on {M(node.vote, 'model2')}
        </p>
      )
  }
}
