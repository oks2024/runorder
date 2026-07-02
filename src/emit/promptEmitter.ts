/**
 * Prompt emitter — the durable, primary output path.
 *
 * Serializes a `WorkflowSpec` into a SINGLE structured-Markdown artifact (no separate JSON
 * block) that a Claude Code user pastes, approves, and runs. The artifact is the one
 * authoritative, hand-editable representation; export is one-way (the model is never
 * reconstructed from it).
 *
 * Faithfulness design (Architecture.md "Prompt emitter"):
 *   1. one structured-Markdown artifact — closed-ness comes from constraint language, not JSON;
 *   2. explicitly trigger the mechanism (`ultracode`) so Claude routes to the workflow runtime;
 *   3. state the spec as closed constraints (do not add/remove/merge/re-model any stage);
 *   4. leave only the JS control-flow implementation to Claude; the spec owns the *what*;
 *   5. ask Claude to show the phase plan before running (dovetails the approval screen);
 *   6. resolve model aliases → canonical full ids on emit.
 *
 * Output is deterministic from the model, so it snapshots/diffs cleanly — that is the
 * faithfulness fixture suite's guard (emit specs → diff the phase plan against the spec).
 */
import { INHERIT, resolveAlias } from '@/lib/models'
import type { PatternNode, WorkflowSpec } from '@/spec/schema'

const PHASE_LABEL_WIDTH = 7 // 'fan-out'.length

/** Render a `model` value as the artifact should carry it (aliases → canonical id). */
function renderModel(model: string): string {
  if (model === INHERIT) return 'inherit (session model)'
  return resolveAlias(model)
}

/** Display name for an agent ref; a dangling ref is marked, never silently dropped. */
function agentName(spec: WorkflowSpec, ref: string): string {
  const agent = spec.agents.find((a) => a.id === ref)
  return agent ? agent.name : `«missing agent: ${ref}»`
}

/** Indent every non-empty line by 4 spaces (no trailing whitespace on blank lines). */
function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.length ? `    ${line}` : ''))
    .join('\n')
}

function renderAgents(spec: WorkflowSpec): string {
  const lines: string[] = ['## Agents (model is authoritative — pin each stage to exactly this model)']
  for (const agent of spec.agents) {
    lines.push(`- ${agent.name} → ${renderModel(agent.model)}`)
    if (agent.prompt.trim().length) lines.push(indent(agent.prompt))
  }
  return lines.join('\n')
}

/** One phase line (1-based). Handles the V1 set (step / fan-out); degrades for the rest. */
function renderPhase(spec: WorkflowSpec, node: PatternNode, index: number): string {
  const n = index + 1
  const label = (l: string) => `${n}. ${l.padEnd(PHASE_LABEL_WIDTH)} — `
  switch (node.type) {
    case 'agent': {
      const grant = node.grants && node.grants[0]
      const base = `${label('step')}${agentName(spec, node.agent)}`
      return grant
        ? `${base} (may delegate to ${agentName(spec, grant.agent)}, ≤ ${grant.cap} instances)`
        : base
    }
    case 'fanout': {
      const over = index === 0 ? 'over the workflow input' : `over phase ${index} output`
      return (
        `${label('fan-out')}${agentName(spec, node.agent)} ${over} (dynamic-N, cap ${node.cap})`
      )
    }
    case 'iterateUntil': {
      const who = node.body.type === 'agent' ? agentName(spec, node.body.agent) : `(${node.body.type} body)`
      return `${label('loop')}${who} repeated until it reports done (≤ ${node.maxIter} iterations)`
    }
    case 'mapReduce':
      return (
        `${label('map-red')}${agentName(spec, node.map.agent)} over prior output ` +
        `(cap ${node.map.cap}), then ${agentName(spec, node.reduce)} reduces the results`
      )
    case 'adversarial':
      return (
        `${label('adv')}${agentName(spec, node.producer)} produces, ` +
        `then ${agentName(spec, node.critic)} critiques it`
      )
    case 'multiAngle':
      return (
        `${label('multi')}${agentName(spec, node.agent)} from ${node.angles} angles, ` +
        `then ${agentName(spec, node.vote)} votes on the best`
      )
    default:
      // Only a nested `sequence` reaches here; render rather than crash.
      return `${label(node.type)}(pattern not yet rendered)`
  }
}

function renderPhases(spec: WorkflowSpec): string {
  const phases = spec.root.type === 'sequence' ? spec.root.steps : [spec.root]
  const lines: string[] = ['## Phases (ordered top→down; each phase passes its results forward)']
  phases.forEach((node, i) => lines.push(renderPhase(spec, node, i)))
  return lines.join('\n')
}

/** Build the single structured-Markdown artifact for a spec. Pure; never mutates. */
export function emitPrompt(spec: WorkflowSpec): string {
  const header = [
    'Run the following as a dynamic workflow (ultracode).',
    'Use EXACTLY these agents, models, and phases — do not add, remove, merge, or re-model any stage.',
    'You write the orchestration control-flow; the spec below fixes the agents, models, topology, and caps.',
  ].join('\n')

  const title = `# Workflow: ${spec.name}`
  const caps =
    `Caps — concurrency: ${spec.caps.concurrency}, total: ${spec.caps.total}  ` +
    `(intended bounds, not runtime-enforced)`

  const footer =
    'Before running, show the planned phases, the model per stage, and the per-stage caps for approval.'

  return [
    header,
    '',
    title,
    caps,
    '',
    renderAgents(spec),
    '',
    renderPhases(spec),
    '',
    footer,
  ].join('\n')
}
