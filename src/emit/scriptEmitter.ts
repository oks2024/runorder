/**
 * Script emitter — the runtime-faithful, primary output path.
 *
 * Serializes a `WorkflowSpec` into a runtime-valid Claude Code dynamic-workflow `.js`
 * script: `export const meta`, then `phase()` / `agent()` / `parallel()` calls. Unlike the
 * prompt emitter (which hands Claude prose and asks it to *author* the orchestration), this
 * emits the orchestration itself — so per-stage model routing is executed *literally* by the
 * runtime, not re-derived by a model. That makes the "model is enforced" claim real.
 *
 * Empirically grounded (see OpenQuestions.md, Findings 2026-07-02): a live probe confirmed
 *   - `agent(prompt, { model })` honors a per-call model, and
 *   - an unknown model id fails LOUD (errors) rather than silently falling back —
 * so a faithfully-emitted `{ model }` is a checkable guarantee.
 *
 * Contract:
 *   - Output is deterministic from the model (golden-snapshot guarded), one-way (never re-imported).
 *   - Version-tagged to the runtime it targets (guardrail #3 / OpenQuestions #1).
 *   - Deferred pattern nodes emit a loud `throw`, never a silently-skipped stage.
 */
import { INHERIT, resolveAlias } from '@/lib/models'
import type { PatternNode, WorkflowSpec } from '@/spec/schema'

/** Runtime release this emitter was validated against. Static so output stays deterministic. */
export const RUNTIME_TAG = 'claude-code dynamic-workflow runtime · probed 2026-07-02'

/** A JS string literal for `raw` (handles quotes, newlines, unicode) — deterministic. */
function js(raw: string): string {
  return JSON.stringify(raw)
}

/** Resolve an agent ref to its spec entry, or null if dangling. */
function findAgent(spec: WorkflowSpec, ref: string) {
  return spec.agents.find((a) => a.id === ref) ?? null
}

/** The `opts` object literal for an `agent()` call: model (unless inherit) + label + extras. */
function agentOpts(model: string, label: string, extra: string[] = []): string {
  const parts: string[] = []
  // `inherit` == use the session model == omit `model` entirely (that IS the default).
  if (model !== INHERIT) parts.push(`model: ${js(resolveAlias(model))}`)
  parts.push(`label: ${js(label)}`)
  parts.push(...extra)
  return `{ ${parts.join(', ')} }`
}

/** JS expression suffix appending the prior phase's result as context (empty for phase 1). */
function forwardSuffix(index: number, input: string): string {
  return index === 0 ? '' : ` + "\\n\\nInput from the previous phase:\\n" + asText(${input})`
}

/** Like `agentOpts` but the label is a raw JS expression (for per-instance labels). */
function optsExprDynamicLabel(model: string, labelExpr: string, extra: string[] = []): string {
  const parts: string[] = []
  if (model !== INHERIT) parts.push(`model: ${js(resolveAlias(model))}`)
  parts.push(`label: ${labelExpr}`)
  parts.push(...extra)
  return `{ ${parts.join(', ')} }`
}

/** Does this node fan a prior result into items (needs the `toItems` helper)? */
function usesToItems(node: PatternNode): boolean {
  return (
    node.type === 'fanout' ||
    node.type === 'mapReduce' ||
    (node.type === 'agent' && !!node.grants && node.grants.length > 0)
  )
}

/**
 * Emit one phase (a top-level step of the root sequence), 1-based.
 * `prevVar` is the variable holding the previous phase's result (null for the first phase,
 * where the input is the workflow's `args`). Returns { code, outVar }.
 */
function renderPhase(
  spec: WorkflowSpec,
  node: PatternNode,
  index: number,
): { code: string; outVar: string } {
  const n = index + 1
  const outVar = `p${n}`
  const input = index === 0 ? 'args' : `p${index}` // prior phase's out var
  const title = `Phase ${n}`

  switch (node.type) {
    case 'agent': {
      const agent = findAgent(spec, node.agent)
      if (!agent) return { code: danglingThrow(node.agent, title), outVar }
      const grant = node.grants && node.grants[0]
      if (grant) {
        // A+ capped delegation: the lead runs, then a capped fan-out of the granted agent
        // works over the lead's output — bounded to `grant.cap` instances (the real guarantee).
        const grantee = findAgent(spec, grant.agent)
        if (!grantee) return { code: danglingThrow(grant.agent, title), outVar }
        return {
          code:
            `phase(${js(title)})\n` +
            `const ${outVar}_lead = await agent(\n` +
            `  ${js(agent.prompt)}${forwardSuffix(index, input)},\n` +
            `  ${agentOpts(agent.model, agent.name)},\n` +
            `)\n` +
            `// A+ capped delegation → ${grantee.name}, bounded to ${grant.cap} instance(s).\n` +
            `const ${outVar} = (await parallel(\n` +
            `  toItems(${outVar}_lead).slice(0, ${grant.cap}).map((item) => () =>\n` +
            `    agent(\n` +
            `      ${js(grantee.prompt)} + "\\n\\nDelegated sub-task:\\n" + asText(item),\n` +
            `      ${agentOpts(grantee.model, grantee.name)},\n` +
            `    ),\n` +
            `  ),\n` +
            `)).filter(Boolean)`,
          outVar,
        }
      }
      return {
        code:
          `phase(${js(title)})\n` +
          `const ${outVar} = await agent(\n` +
          `  ${js(agent.prompt)}${forwardSuffix(index, input)},\n` +
          `  ${agentOpts(agent.model, agent.name)},\n` +
          `)`,
        outVar,
      }
    }
    case 'fanout': {
      const agent = findAgent(spec, node.agent)
      if (!agent) return { code: danglingThrow(node.agent, title), outVar }
      // Dynamic-N bounded by cap: split the prior result into items, slice to `cap` (a REAL
      // bound — `parallel` only caps *concurrency*, so we cap the item count ourselves).
      return {
        code:
          `phase(${js(title)})\n` +
          `const ${outVar} = (await parallel(\n` +
          `  toItems(${input}).slice(0, ${node.cap}).map((item) => () =>\n` +
          `    agent(\n` +
          `      ${js(agent.prompt)} + "\\n\\nInput:\\n" + asText(item),\n` +
          `      ${agentOpts(agent.model, agent.name)},\n` +
          `    ),\n` +
          `  ),\n` +
          `)).filter(Boolean)`,
        outVar,
      }
    }
    case 'iterateUntil': {
      // V1 loops wrap a single body agent. Repeat it up to `maxIter`, carrying state forward;
      // stop early when the agent reports `done` via a structured {done, output} schema — a
      // real, runtime-enforced break condition (not an LLM-judged prose "until").
      if (node.body.type !== 'agent') {
        return {
          code:
            `phase(${js(title)})\n` +
            `throw new Error(${js(`Loop body "${node.body.type}" is not supported — V1 loops wrap a single agent.`)})`,
          outVar,
        }
      }
      const agent = findAgent(spec, node.body.agent)
      if (!agent) return { code: danglingThrow(node.body.agent, title), outVar }
      return {
        code:
          `phase(${js(title)})\n` +
          `let ${outVar} = ${input}\n` +
          `for (let i = 0; i < ${node.maxIter}; i++) {\n` +
          `  const it = await agent(\n` +
          `    ${js(agent.prompt)} + "\\n\\nIteration " + (i + 1) + " of ${node.maxIter}. Prior state:\\n" + asText(${outVar}),\n` +
          `    ${agentOpts(agent.model, agent.name, ['schema: LOOP_SCHEMA'])},\n` +
          `  )\n` +
          `  if (it == null) break\n` +
          `  ${outVar} = it.output\n` +
          `  if (it.done) break\n` +
          `}`,
        outVar,
      }
    }
    case 'mapReduce': {
      const mapAgent = findAgent(spec, node.map.agent)
      if (!mapAgent) return { code: danglingThrow(node.map.agent, title), outVar }
      const reduceAgent = findAgent(spec, node.reduce)
      if (!reduceAgent) return { code: danglingThrow(node.reduce, title), outVar }
      return {
        code:
          `phase(${js(title)})\n` +
          `const ${outVar}_mapped = (await parallel(\n` +
          `  toItems(${input}).slice(0, ${node.map.cap}).map((item) => () =>\n` +
          `    agent(\n` +
          `      ${js(mapAgent.prompt)} + "\\n\\nInput:\\n" + asText(item),\n` +
          `      ${agentOpts(mapAgent.model, mapAgent.name)},\n` +
          `    ),\n` +
          `  ),\n` +
          `)).filter(Boolean)\n` +
          `const ${outVar} = await agent(\n` +
          `  ${js(reduceAgent.prompt)} + "\\n\\nItems to merge:\\n" + asText(${outVar}_mapped),\n` +
          `  ${agentOpts(reduceAgent.model, reduceAgent.name)},\n` +
          `)`,
        outVar,
      }
    }
    case 'adversarial': {
      const producer = findAgent(spec, node.producer)
      if (!producer) return { code: danglingThrow(node.producer, title), outVar }
      const critic = findAgent(spec, node.critic)
      if (!critic) return { code: danglingThrow(node.critic, title), outVar }
      return {
        code:
          `phase(${js(title)})\n` +
          `const ${outVar}_draft = await agent(\n` +
          `  ${js(producer.prompt)}${forwardSuffix(index, input)},\n` +
          `  ${agentOpts(producer.model, producer.name)},\n` +
          `)\n` +
          `const ${outVar}_critique = await agent(\n` +
          `  ${js(critic.prompt)} + "\\n\\nProposal to critique:\\n" + asText(${outVar}_draft),\n` +
          `  ${agentOpts(critic.model, critic.name)},\n` +
          `)\n` +
          `const ${outVar} = { draft: ${outVar}_draft, critique: ${outVar}_critique }`,
        outVar,
      }
    }
    case 'multiAngle': {
      const worker = findAgent(spec, node.agent)
      if (!worker) return { code: danglingThrow(node.agent, title), outVar }
      const voter = findAgent(spec, node.vote)
      if (!voter) return { code: danglingThrow(node.vote, title), outVar }
      const angleLabel = `${js(worker.name + ' (angle ')} + (k + 1) + ${js(')')}`
      return {
        code:
          `phase(${js(title)})\n` +
          `const ${outVar}_takes = (await parallel(\n` +
          `  Array.from({ length: ${node.angles} }, (_, k) => () =>\n` +
          `    agent(\n` +
          `      ${js(worker.prompt)} + "\\n\\nAngle " + (k + 1) + " of ${node.angles}. Input:\\n" + asText(${input}),\n` +
          `      ${optsExprDynamicLabel(worker.model, angleLabel)},\n` +
          `    ),\n` +
          `  ),\n` +
          `)).filter(Boolean)\n` +
          `const ${outVar} = await agent(\n` +
          `  ${js(voter.prompt)} + "\\n\\nCandidate answers:\\n" + asText(${outVar}_takes),\n` +
          `  ${agentOpts(voter.model, voter.name)},\n` +
          `)`,
        outVar,
      }
    }
    default:
      // Only a nested `sequence` reaches here (all leaf patterns are handled). Fail loud
      // rather than emit a silently-incomplete workflow.
      return {
        code:
          `phase(${js(title)})\n` +
          `throw new Error(${js(`Pattern "${node.type}" is not supported at the top level — flatten it in the editor.`)})`,
        outVar,
      }
  }
}

function danglingThrow(ref: string, title: string): string {
  return (
    `phase(${js(title)})\n` +
    `throw new Error(${js(`Unresolved agent ref "${ref}" — fix the spec before running.`)})`
  )
}

/** Small runtime helpers, emitted only when the body actually references them. */
function helpers(need: { toItems: boolean; asText: boolean; loopSchema: boolean }): string {
  const out: string[] = ['// --- generated helpers ---']
  if (need.toItems) {
    out.push(
      '// Coerce a prior phase result into a list of items to fan out over. Best-effort:',
      '// arrays pass through; {items|findings} arrays are unwrapped; a string is split on blank',
      '// lines / list markers, falling back to single newlines. This is a HEURISTIC — for a',
      '// strict N, give the producing agent an output schema so it returns a real array.',
      'function toItems(x) {',
      '  if (Array.isArray(x)) return x',
      '  if (x && Array.isArray(x.items)) return x.items',
      '  if (x && Array.isArray(x.findings)) return x.findings',
      '  if (x == null) return []',
      '  const s = String(x).trim()',
      '  let parts = s.split(/\\n{2,}|\\n(?=\\s*[-*\\d])/).map((p) => p.trim()).filter(Boolean)',
      '  if (parts.length <= 1) parts = s.split(/\\n+/).map((p) => p.trim()).filter(Boolean)',
      '  return parts',
      '}',
    )
  }
  if (need.asText) {
    out.push(
      'function asText(x) {',
      '  return typeof x === "string" ? x : JSON.stringify(x, null, 2)',
      '}',
    )
  }
  if (need.loopSchema) {
    out.push(
      '// A loop body reports whether it is done and the state to carry into the next iteration.',
      'const LOOP_SCHEMA = {',
      '  type: "object",',
      '  properties: {',
      '    done: { type: "boolean", description: "true when the task is complete; stops the loop" },',
      '    output: { type: "string", description: "current result / working state to carry forward" },',
      '  },',
      '  required: ["done", "output"],',
      '}',
    )
  }
  return out.join('\n')
}

/** The `meta` block. `detail` surfaces the per-stage model on the approval screen. */
function renderMeta(spec: WorkflowSpec): string {
  const phases = spec.root.type === 'sequence' ? spec.root.steps : [spec.root]
  const phaseLines = phases
    .map((node, i) => `    { title: ${js(`Phase ${i + 1}`)}, detail: ${js(phaseDetail(spec, node))} },`)
    .join('\n')
  return [
    'export const meta = {',
    `  name: ${js(spec.name)},`,
    `  description: ${js(spec.name)},`,
    '  phases: [',
    phaseLines,
    '  ],',
    '}',
  ].join('\n')
}

/** Human-readable per-phase summary used in `meta.phases[].detail` and shown on approval. */
function phaseDetail(spec: WorkflowSpec, node: PatternNode): string {
  switch (node.type) {
    case 'agent': {
      const base = who(spec, node.agent)
      const grant = node.grants && node.grants[0]
      return grant
        ? `step — ${base} (delegates ≤ ${grant.cap} to ${who(spec, grant.agent)})`
        : `step — ${base}`
    }
    case 'fanout':
      return `fan-out — ${who(spec, node.agent)} (dynamic-N, cap ${node.cap})`
    case 'iterateUntil': {
      const ref = node.body.type === 'agent' ? node.body.agent : null
      return `loop — ${ref ? who(spec, ref) : `(${node.body.type} body)`} (until done, ≤ ${node.maxIter})`
    }
    case 'mapReduce':
      return `map-reduce — ${who(spec, node.map.agent)} ×${node.map.cap} → reduce ${who(spec, node.reduce)}`
    case 'adversarial':
      return `adversarial — ${who(spec, node.producer)} vs ${who(spec, node.critic)}`
    case 'multiAngle':
      return `multi-angle — ${who(spec, node.agent)} ×${node.angles} → vote ${who(spec, node.vote)}`
    default:
      return `${node.type} — (not yet supported)`
  }
}

function renderModel(model: string): string {
  return model === INHERIT ? 'session model' : resolveAlias(model)
}

/** "<name> → <model>" for a ref, or a marked missing-agent token. Used in `meta` details. */
function who(spec: WorkflowSpec, ref: string): string {
  const a = findAgent(spec, ref)
  return a ? `${a.name} → ${renderModel(a.model)}` : `«missing agent: ${ref}»`
}

/** Build the complete runtime-valid workflow script for a spec. Pure; never mutates. */
export function emitScript(spec: WorkflowSpec): string {
  const phases = spec.root.type === 'sequence' ? spec.root.steps : [spec.root]

  const header = [
    `// Dynamic workflow — generated by Dynamic Workflow Editor (one-way export; edit the spec, not this file).`,
    `// Target: ${RUNTIME_TAG}`,
    `// Caps — concurrency ${spec.caps.concurrency}, total ${spec.caps.total} (fan-out counts are capped in-script; concurrency is the runtime's global cap).`,
  ].join('\n')

  const rendered = phases.map((node, i) => renderPhase(spec, node, i))
  const lastVar = rendered.length ? rendered[rendered.length - 1].outVar : null
  const body = rendered.map((r) => r.code).join('\n\n')
  const ret = lastVar ? `return ${lastVar}` : 'return null'

  // asText is used by every composite pattern and by any step past the first (forward context).
  const isComposite = (n: PatternNode) =>
    n.type !== 'agent' || (!!n.grants && n.grants.length > 0)
  const need = {
    toItems: phases.some(usesToItems),
    asText: phases.length > 1 || phases.some(isComposite),
    loopSchema: phases.some((n) => n.type === 'iterateUntil'),
  }

  const blocks = [header, '', renderMeta(spec)]
  if (need.toItems || need.asText || need.loopSchema) blocks.push('', helpers(need))
  blocks.push('', body, '', ret)

  return blocks.join('\n')
}
