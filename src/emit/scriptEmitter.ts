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

/** True if any node in the tree is a `fanout` (drives whether helpers are emitted). */
function hasFanout(node: PatternNode): boolean {
  if (node.type === 'fanout') return true
  if (node.type === 'sequence') return node.steps.some(hasFanout)
  if (node.type === 'iterateUntil') return hasFanout(node.body)
  return false
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
      const promptExpr =
        index === 0
          ? js(agent.prompt)
          : `${js(agent.prompt)} + "\\n\\nInput from the previous phase:\\n" + asText(${input})`
      return {
        code:
          `phase(${js(title)})\n` +
          `const ${outVar} = await agent(\n` +
          `  ${promptExpr},\n` +
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
    default:
      // Deferred patterns (mapReduce/adversarial/multiAngle/iterateUntil/sequence-nested):
      // fail loud rather than emit a silently-incomplete workflow. Workstream 3 fills these in.
      return {
        code:
          `phase(${js(title)})\n` +
          `throw new Error(${js(`Pattern "${node.type}" is not yet supported by the script emitter — regenerate after upgrading the editor.`)})`,
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
      const a = findAgent(spec, node.agent)
      return a ? `step — ${a.name} → ${renderModel(a.model)}` : `step — «missing agent: ${node.agent}»`
    }
    case 'fanout': {
      const a = findAgent(spec, node.agent)
      const who = a ? `${a.name} → ${renderModel(a.model)}` : `«missing agent: ${node.agent}»`
      return `fan-out — ${who} (dynamic-N, cap ${node.cap})`
    }
    case 'iterateUntil': {
      const ref = node.body.type === 'agent' ? node.body.agent : null
      const a = ref ? findAgent(spec, ref) : null
      const who = a ? `${a.name} → ${renderModel(a.model)}` : `«missing agent: ${ref ?? node.body.type}»`
      return `loop — ${who} (until done, ≤ ${node.maxIter})`
    }
    default:
      return `${node.type} — (not yet supported)`
  }
}

function renderModel(model: string): string {
  return model === INHERIT ? 'session model' : resolveAlias(model)
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

  const anyFanout = phases.some(hasFanout)
  const anyLoop = phases.some((n) => n.type === 'iterateUntil')
  // asText is used by fan-outs, loops, and any step past the first (forward-passed context).
  const need = {
    toItems: anyFanout,
    asText: anyFanout || anyLoop || phases.length > 1,
    loopSchema: anyLoop,
  }

  const blocks = [header, '', renderMeta(spec)]
  if (need.toItems || need.asText || need.loopSchema) blocks.push('', helpers(need))
  blocks.push('', body, '', ret)

  return blocks.join('\n')
}
