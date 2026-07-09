/**
 * Prompt emitter — the durable fallback output path (the script emitter is primary).
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
import { deriveMemoryNames } from '@/lib/memoryNames'
import { consumesItems, isSchemaForced } from './plumbing'
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
      const inputOver = spec.input ? `over the launch input [${spec.input.label}]` : 'over the workflow input'
      const over = index === 0 ? inputOver : `over phase ${index} output`
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
    case 'refine':
      return (
        `${label('refine')}${agentName(spec, node.producer)} drafts, ` +
        `${agentName(spec, node.critic)} judges approve/reject with a critique; ` +
        `revise against the critique until approved (≤ ${node.maxIter} rounds); ` +
        `the phase output is the final draft`
      )
    case 'verify':
      return (
        `${label('verify')}${agentName(spec, node.skeptic)} casts ${node.votes} independent ` +
        `refutation votes per item of the prior output (≤ ${node.cap} items); ` +
        `keep ONLY items whose refutals are a strict minority — the phase output is the surviving items`
      )
    case 'branches': {
      const names = node.branches.map((ref) => agentName(spec, ref))
      return (
        `${label('branch')}${names.join(', ')} run once each, IN PARALLEL, on the same reads; ` +
        `keep every output separate and labeled with its agent's name — the phase output is that labeled set, in branch order`
      )
    }
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
  const names = deriveMemoryNames(spec)
  const nameById = new Map<string, string>()
  names.forEach((e) => {
    if (e.nodeId) nameById.set(e.nodeId, e.name)
  })

  const lines: string[] = [
    '## Phases (ordered top→down; context flows ONLY through the reads listed per phase)',
    'Each phase output is a named memory (the agent name below). Give an agent EXACTLY the',
    "memories its phase reads — nothing else flows implicitly. These are the tool's intended",
    'semantics; the script path enforces them, this prompt path asks you to honor them.',
  ]
  phases.forEach((node, i) => {
    let line = renderPhase(spec, node, i)
    if (i === 0 && spec.input && !consumesItems(node)) {
      line += ` · receives the launch input [${spec.input.label}]`
    }
    const reads = 'reads' in node ? (node.reads ?? []) : []
    if (reads.length) {
      const readNames = reads.map((t) => nameById.get(t) ?? `«${t}?»`)
      line += ` · reads: ${readNames.join(', ')}`
    }
    if (isSchemaForced(phases, i)) {
      line +=
        ' · must END its output with ONLY the list of items to fan out over,' +
        ' one per blank-line-separated block (shared context first, clearly separated)'
    }
    lines.push(line)
  })
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

  const input = spec.input
    ? `Launch input (args): **${spec.input.label}**` +
      (spec.input.description ? ` — ${spec.input.description}` : '') +
      '. Provide it as the workflow input; the first phase receives it.'
    : null

  const footer =
    'Before running, show the planned phases, the model per stage, and the per-stage caps for approval.'

  return [
    header,
    '',
    title,
    caps,
    ...(input ? [input] : []),
    '',
    renderAgents(spec),
    '',
    renderPhases(spec),
    '',
    footer,
  ].join('\n')
}
