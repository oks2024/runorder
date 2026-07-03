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
 * Pipeline plumbing is injected here — the user authors only *what each agent does*:
 *   - Context flows through named memories: every phase's output is a memory (named in
 *     `lib/memoryNames.ts`); a phase's `reads` are spliced into its prompts as labeled
 *     `[name]` blocks. Nothing flows implicitly.
 *   - A producer feeding a fan-out/map (or a delegation lead) is schema-forced to
 *     `{ context, items }` (FANOUT_SCHEMA — same run-validated seam as LOOP_SCHEMA), so
 *     the consumer maps over an exact array; its memory is the shared `context`.
 *   - `toItems` remains only as a heuristic fallback for inputs without an enforced
 *     schema: workflow `args`, and loop/adversarial outputs feeding a fan-out.
 *
 * Contract:
 *   - Output is deterministic from the model (golden-snapshot guarded), one-way (never re-imported).
 *   - Version-tagged to the runtime it targets (guardrail #3 / OpenQuestions #1).
 *   - Deferred pattern nodes and unresolved refs/reads emit a loud `throw`, never a
 *     silently-skipped stage.
 */
import { INHERIT, resolveAlias } from '@/lib/models'
import { deriveMemoryNames } from '@/lib/memoryNames'
import { isSchemaForced } from './plumbing'
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

/** Like `agentOpts` but the label is a raw JS expression (for per-instance labels). */
function optsExprDynamicLabel(model: string, labelExpr: string, extra: string[] = []): string {
  const parts: string[] = []
  if (model !== INHERIT) parts.push(`model: ${js(resolveAlias(model))}`)
  parts.push(`label: ${labelExpr}`)
  parts.push(...extra)
  return `{ ${parts.join(', ')} }`
}

// --- phase plumbing pre-pass -------------------------------------------------------------

interface PhaseInfo {
  node: PatternNode
  outVar: string
  memoryName: string
  /** Terminal producer is forced to `{ context, items }` because the next phase fans out. */
  schemaForced: boolean
}

function buildPhaseInfos(spec: WorkflowSpec, phases: PatternNode[]): PhaseInfo[] {
  const names = deriveMemoryNames(spec)
  return phases.map((node, i) => ({
    node,
    outVar: `p${i + 1}`,
    memoryName: names[i]?.name ?? `phase-${i + 1}`,
    schemaForced: isSchemaForced(phases, i),
  }))
}

/** `nodeId → phase index` for reads resolution (id-less phases are not readable). */
function phaseIndexById(phases: PatternNode[]): Map<string, number> {
  const map = new Map<string, number>()
  phases.forEach((node, i) => {
    if ('id' in node && node.id) map.set(node.id, i)
  })
  return map
}

/** The JS expression holding what a reader of phase `info` receives (context if forced). */
function memoryExpr(info: PhaseInfo): string {
  return info.schemaForced ? `${info.outVar}.context` : info.outVar
}

/**
 * The prompt-suffix expression splicing this node's reads as labeled memory blocks, or the
 * offending id when a read can't resolve to an earlier phase (emitted as a loud throw).
 */
function readsSuffix(
  node: PatternNode,
  index: number,
  infos: PhaseInfo[],
  byId: Map<string, number>,
): { suffix: string } | { badRead: string } {
  const reads = 'reads' in node ? (node.reads ?? []) : []
  let suffix = ''
  for (const target of reads) {
    const at = byId.get(target)
    if (at === undefined || at >= index) return { badRead: target }
    const info = infos[at]
    suffix += ` + ${js(`\n\n[${info.memoryName}]\n`)} + asText(${memoryExpr(info)})`
  }
  return { suffix }
}

/**
 * The items expression a fan-out/map at `index` iterates. Exact when the previous phase is
 * schema-forced (`.items`) or already an array (fan-out / delegation output); heuristic
 * `toItems` otherwise (workflow args, loop/adversarial outputs).
 */
function itemsExpr(index: number, infos: PhaseInfo[]): string {
  if (index === 0) return 'toItems(args)'
  const prev = infos[index - 1]
  if (prev.schemaForced) return `${prev.outVar}.items`
  const pn = prev.node
  if (pn.type === 'fanout' || (pn.type === 'agent' && !!pn.grants && pn.grants.length > 0))
    return prev.outVar
  return `toItems(${prev.outVar})`
}

// --- per-phase rendering -----------------------------------------------------------------

/**
 * Emit one phase (a top-level step of the root sequence), 1-based.
 * Returns { code, outVar }; all plumbing (reads splice, schema forcing, items source) comes
 * from the pre-pass `infos`.
 */
function renderPhase(
  spec: WorkflowSpec,
  infos: PhaseInfo[],
  byId: Map<string, number>,
  index: number,
): { code: string; outVar: string } {
  const info = infos[index]
  const node = info.node
  const outVar = info.outVar
  const title = `Phase ${index + 1}`

  const r = readsSuffix(node, index, infos, byId)
  if ('badRead' in r) return { code: danglingReadThrow(r.badRead, title), outVar }
  const reads = r.suffix
  const forcedExtra = info.schemaForced ? ['schema: FANOUT_SCHEMA'] : []

  switch (node.type) {
    case 'agent': {
      const agent = findAgent(spec, node.agent)
      if (!agent) return { code: danglingThrow(node.agent, title), outVar }
      const grant = node.grants && node.grants[0]
      if (grant) {
        // A+ capped delegation: the lead is schema-forced to { context, items }, then a
        // capped fan-out of the granted agent works the exact item list — each grantee gets
        // the lead's shared context (intra-phase, so it can't be expressed as a read).
        const grantee = findAgent(spec, grant.agent)
        if (!grantee) return { code: danglingThrow(grant.agent, title), outVar }
        return {
          code:
            `phase(${js(title)})\n` +
            `const ${outVar}_lead = await agent(\n` +
            `  ${js(agent.prompt)}${reads},\n` +
            `  ${agentOpts(agent.model, agent.name, ['schema: FANOUT_SCHEMA'])},\n` +
            `)\n` +
            `// A+ capped delegation → ${grantee.name}, bounded to ${grant.cap} instance(s).\n` +
            `const ${outVar} = (await parallel(\n` +
            `  ${outVar}_lead.items.slice(0, ${grant.cap}).map((item) => () =>\n` +
            `    agent(\n` +
            `      ${js(grantee.prompt)} + ${js(`\n\n[${agent.name} context]\n`)} + ${outVar}_lead.context + "\\n\\nDelegated sub-task:\\n" + asText(item),\n` +
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
          `  ${js(agent.prompt)}${reads},\n` +
          `  ${agentOpts(agent.model, agent.name, forcedExtra)},\n` +
          `)`,
        outVar,
      }
    }
    case 'fanout': {
      const agent = findAgent(spec, node.agent)
      if (!agent) return { code: danglingThrow(node.agent, title), outVar }
      // Dynamic-N bounded by cap: slice the item list to `cap` (a REAL bound — `parallel`
      // only caps *concurrency*, so we cap the item count ourselves).
      return {
        code:
          `phase(${js(title)})\n` +
          `const ${outVar} = (await parallel(\n` +
          `  ${itemsExpr(index, infos)}.slice(0, ${node.cap}).map((item) => () =>\n` +
          `    agent(\n` +
          `      ${js(agent.prompt)}${reads} + "\\n\\nYour assigned item:\\n" + asText(item),\n` +
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
          `let ${outVar} = ""\n` +
          `for (let i = 0; i < ${node.maxIter}; i++) {\n` +
          `  const it = await agent(\n` +
          `    ${js(agent.prompt)}${reads} + "\\n\\nIteration " + (i + 1) + " of ${node.maxIter}." + (i === 0 ? "" : "\\nPrior state:\\n" + asText(${outVar})),\n` +
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
          `  ${itemsExpr(index, infos)}.slice(0, ${node.map.cap}).map((item) => () =>\n` +
          `    agent(\n` +
          `      ${js(mapAgent.prompt)}${reads} + "\\n\\nYour assigned item:\\n" + asText(item),\n` +
          `      ${agentOpts(mapAgent.model, mapAgent.name)},\n` +
          `    ),\n` +
          `  ),\n` +
          `)).filter(Boolean)\n` +
          `const ${outVar} = await agent(\n` +
          `  ${js(reduceAgent.prompt)}${reads} + "\\n\\nItems to merge:\\n" + asText(${outVar}_mapped),\n` +
          `  ${agentOpts(reduceAgent.model, reduceAgent.name, forcedExtra)},\n` +
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
          `  ${js(producer.prompt)}${reads},\n` +
          `  ${agentOpts(producer.model, producer.name)},\n` +
          `)\n` +
          `const ${outVar}_critique = await agent(\n` +
          `  ${js(critic.prompt)}${reads} + "\\n\\nProposal to critique:\\n" + asText(${outVar}_draft),\n` +
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
          `      ${js(worker.prompt)}${reads} + "\\n\\nAngle " + (k + 1) + " of ${node.angles}.",\n` +
          `      ${optsExprDynamicLabel(worker.model, angleLabel)},\n` +
          `    ),\n` +
          `  ),\n` +
          `)).filter(Boolean)\n` +
          `const ${outVar} = await agent(\n` +
          `  ${js(voter.prompt)}${reads} + "\\n\\nCandidate answers:\\n" + asText(${outVar}_takes),\n` +
          `  ${agentOpts(voter.model, voter.name, forcedExtra)},\n` +
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

function danglingReadThrow(target: string, title: string): string {
  return (
    `phase(${js(title)})\n` +
    `throw new Error(${js(`Unresolved read "${target}" — a memory only exists once its phase has run; fix the spec before running.`)})`
  )
}

/** Small runtime helpers, emitted only when the body actually references them. */
function helpers(need: {
  toItems: boolean
  asText: boolean
  loopSchema: boolean
  fanoutSchema: boolean
}): string {
  const out: string[] = ['// --- generated helpers ---']
  if (need.toItems) {
    out.push(
      '// Fallback coercion for inputs WITHOUT an enforced { context, items } schema (the',
      '// workflow args, or a loop/adversarial output feeding a fan-out). Best-effort: arrays',
      '// pass through; {items|findings} arrays are unwrapped; a string is split on blank',
      '// lines / list markers, falling back to single newlines. This is a HEURISTIC.',
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
  if (need.fanoutSchema) {
    out.push(
      '// A producer that feeds a fan-out returns shared context + the exact item list',
      '// (runtime-enforced): downstream readers get `context`, the fan-out maps `items`.',
      'const FANOUT_SCHEMA = {',
      '  type: "object",',
      '  properties: {',
      '    context: { type: "string", description: "shared context every downstream reader needs (setting, constraints, decisions)" },',
      '    items: { type: "array", items: { type: "string" }, description: "the list to fan out over — one self-contained work item per element" },',
      '  },',
      '  required: ["context", "items"],',
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

/** The `meta` block. `detail` surfaces model, reads, and forced shapes on approval. */
function renderMeta(spec: WorkflowSpec, infos: PhaseInfo[], byId: Map<string, number>): string {
  const phaseLines = infos
    .map(
      (_, i) =>
        `    { title: ${js(`Phase ${i + 1}`)}, detail: ${js(phaseDetail(spec, infos, byId, i))} },`,
    )
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
function phaseDetail(
  spec: WorkflowSpec,
  infos: PhaseInfo[],
  byId: Map<string, number>,
  index: number,
): string {
  const info = infos[index]
  const node = info.node
  let base: string
  switch (node.type) {
    case 'agent': {
      const lead = who(spec, node.agent)
      const grant = node.grants && node.grants[0]
      base = grant
        ? `step — ${lead} (delegates ≤ ${grant.cap} to ${who(spec, grant.agent)})`
        : `step — ${lead}`
      break
    }
    case 'fanout':
      base = `fan-out — ${who(spec, node.agent)} (dynamic-N, cap ${node.cap})`
      break
    case 'iterateUntil': {
      const ref = node.body.type === 'agent' ? node.body.agent : null
      base = `loop — ${ref ? who(spec, ref) : `(${node.body.type} body)`} (until done, ≤ ${node.maxIter})`
      break
    }
    case 'mapReduce':
      base = `map-reduce — ${who(spec, node.map.agent)} ×${node.map.cap} → reduce ${who(spec, node.reduce)}`
      break
    case 'adversarial':
      base = `adversarial — ${who(spec, node.producer)} vs ${who(spec, node.critic)}`
      break
    case 'multiAngle':
      base = `multi-angle — ${who(spec, node.agent)} ×${node.angles} → vote ${who(spec, node.vote)}`
      break
    default:
      return `${node.type} — (not yet supported)`
  }
  const readNames = ('reads' in node ? (node.reads ?? []) : []).map((target) => {
    const at = byId.get(target)
    return at !== undefined && at < index ? infos[at].memoryName : `«${target}?»`
  })
  if (readNames.length) base += ` · reads ${readNames.join(', ')}`
  if (info.schemaForced) base += ' · yields {context, items}'
  return base
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
  const infos = buildPhaseInfos(spec, phases)
  const byId = phaseIndexById(phases)

  const header = [
    `// Dynamic workflow — generated by Prewire (one-way export; edit the spec, not this file).`,
    `// Target: ${RUNTIME_TAG}`,
    `// Caps — concurrency ${spec.caps.concurrency}, total ${spec.caps.total} (fan-out counts are capped in-script; concurrency is the runtime's global cap).`,
    `// Context flow is explicit: each agent receives ONLY the [memory] blocks its phase reads (plus its pattern's own piping).`,
  ].join('\n')

  const rendered = phases.map((_, i) => renderPhase(spec, infos, byId, i))
  const lastVar = rendered.length ? rendered[rendered.length - 1].outVar : null
  const body = rendered.map((r) => r.code).join('\n\n')
  const ret = lastVar ? `return ${lastVar}` : 'return null'

  // Helpers are gated on actual references in the emitted body (DRY with the render pass).
  const need = {
    toItems: body.includes('toItems('),
    asText: body.includes('asText('),
    loopSchema: body.includes('LOOP_SCHEMA'),
    fanoutSchema: body.includes('FANOUT_SCHEMA'),
  }

  const blocks = [header, '', renderMeta(spec, infos, byId)]
  if (need.toItems || need.asText || need.loopSchema || need.fanoutSchema)
    blocks.push('', helpers(need))
  blocks.push('', body, '', ret)

  return blocks.join('\n')
}
