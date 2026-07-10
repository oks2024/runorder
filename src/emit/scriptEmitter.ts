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
import { branchLabels, deriveMemoryNames } from '@/lib/memoryNames'
import { PROV_CAPS, PROV_INPUT, PROV_NAME, provKey, type ProvField } from '@/lib/prov'
import { consumesItems, isSchemaForced, yieldsItemArray } from './plumbing'
import { launchInput, type PatternNode, type WorkflowSpec } from '@/spec/schema'

/** Runtime release this emitter was validated against. Static so output stays deterministic. */
export const RUNTIME_TAG = 'claude-code dynamic-workflow runtime · probed 2026-07-02'

/**
 * One emitted script line, carrying the provenance the prompt-book column needs.
 *
 * `text` is a single line (NEVER contains a newline — the emitter builds one record per
 * `\n`-separated segment; `js()` guarantees prompts can't inject raw newlines). `prov` is an
 * ARRAY because a composite line honestly lights several rundown fields (e.g. the opts
 * line carries both `model` and `schema`; the prompt line carries `prompt` and `reads`).
 * `phaseIndex` is the 0-based root-step index, set on every line of a phase's body block so
 * the prompt-book can hue each phase; header/meta/helpers/return lines leave it unset.
 */
export interface EmitLine {
  text: string
  prov?: string[]
  phaseIndex?: number
}

/** Build one line record; omits empty `prov`/undefined `phaseIndex` for clean records. */
function ln(text: string, prov?: string[], phaseIndex?: number): EmitLine {
  const line: EmitLine = { text }
  if (prov && prov.length) line.prov = prov
  if (phaseIndex !== undefined) line.phaseIndex = phaseIndex
  return line
}

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
 * A branches memory is spliced as one labeled block PER BRANCH (branch order = array order),
 * so the reader sees which sibling produced what — never an unlabeled JSON array.
 *
 * At the FIRST phase, if the workflow declares a launch `input` and this phase is not already
 * an item-consumer (a fan-out/map/verify already reads `args` via `toItems`), the input is
 * spliced first as a labeled `[label]` block over `asText(args)` — same shape as a read.
 * Because it rides the shared suffix, it reaches EVERY agent line in the phase (like a read);
 * `hasInput` lets the caller light `PROV_INPUT` on each of those prompt lines (via `promptProv`).
 */
function readsSuffix(
  spec: WorkflowSpec,
  node: PatternNode,
  index: number,
  infos: PhaseInfo[],
  byId: Map<string, number>,
): { suffix: string; hasInput: boolean } | { badRead: string } {
  let suffix = ''
  const input = launchInput(spec)
  const hasInput = index === 0 && !!input && !consumesItems(node)
  if (hasInput && input) {
    suffix += ` + ${js(`\n\n[${input.label}]\n`)} + asText(args)`
  }
  const reads = 'reads' in node ? (node.reads ?? []) : []
  for (const target of reads) {
    const at = byId.get(target)
    if (at === undefined || at >= index) return { badRead: target }
    const info = infos[at]
    if (info.node.type === 'branches') {
      branchLabels(spec, info.node).forEach((label, k) => {
        suffix += ` + ${js(`\n\n[${label}]\n`)} + asText(${info.outVar}[${k}])`
      })
      continue
    }
    suffix += ` + ${js(`\n\n[${info.memoryName}]\n`)} + asText(${memoryExpr(info)})`
  }
  return { suffix, hasInput }
}

/**
 * The items expression a fan-out/map/verify at `index` iterates. Exact when the previous
 * phase is schema-forced (`.items`) or already an array (fan-out / delegation / verify
 * output); heuristic `toItems` otherwise (workflow args, loop/adversarial outputs).
 */
function itemsExpr(index: number, infos: PhaseInfo[]): string {
  if (index === 0) return 'toItems(args)'
  const prev = infos[index - 1]
  if (prev.schemaForced) return `${prev.outVar}.items`
  if (yieldsItemArray(prev.node)) return prev.outVar
  return `toItems(${prev.outVar})`
}

// --- per-phase rendering -----------------------------------------------------------------

/**
 * Emit one phase (a top-level step of the root sequence), 1-based, as line records.
 *
 * Returns { lines, outVar }; every line carries `phaseIndex` (for the prompt-book's per-phase
 * hue) and, where a line is genuinely derived from an editable rundown field, the
 * provenance key(s) for that field (guardrail #5 — never tag a line a field didn't produce).
 * All plumbing (reads splice, schema forcing, items source) comes from the pre-pass `infos`.
 */
function renderPhase(
  spec: WorkflowSpec,
  infos: PhaseInfo[],
  byId: Map<string, number>,
  index: number,
): { lines: EmitLine[]; outVar: string } {
  const info = infos[index]
  const node = info.node
  const outVar = info.outVar
  const title = `Phase ${index + 1}`
  const nodeId = 'id' in node ? node.id : undefined

  /** Line record stamped with this phase's index. */
  const P = (text: string, prov?: string[]) => ln(text, prov, index)
  /** Provenance keys for this node's fields (empty → undefined; absent id → no tags). */
  const tag = (...fields: (ProvField | false | undefined)[]): string[] | undefined => {
    if (!nodeId) return undefined
    const keys = fields.filter((f): f is ProvField => !!f).map((f) => provKey(nodeId, f))
    return keys.length ? keys : undefined
  }
  const phaseHead = P(`phase(${js(title)})`)
  const danglingAgent = (ref: string) => ({
    lines: [
      phaseHead,
      P(`throw new Error(${js(`Unresolved agent ref "${ref}" — fix the spec before running.`)})`),
    ],
    outVar,
  })

  const r = readsSuffix(spec, node, index, infos, byId)
  if ('badRead' in r) {
    return {
      lines: [
        phaseHead,
        P(
          `throw new Error(${js(`Unresolved read "${r.badRead}" — a memory only exists once its phase has run; fix the spec before running.`)})`,
          tag('reads'),
        ),
      ],
      outVar,
    }
  }
  const reads = r.suffix
  // `hasReads` is derived from real read targets (not the suffix), so the `reads` prov key
  // never lights on a line that carries only the launch-input block.
  const hasReads = 'reads' in node && (node.reads?.length ?? 0) > 0
  const hasInput = r.hasInput
  const forcedExtra = info.schemaForced ? ['schema: FANOUT_SCHEMA'] : []
  /** Prov for a prompt line carrying `${reads}`: the given prompt field (+ `reads` if any)
   *  plus the spec-level `PROV_INPUT` when the launch input is spliced here (phase 0,
   *  non-item-consumer). The input block lives in the shared `${reads}` suffix, so EVERY
   *  agent line in the phase reuses it — pass the line's own field (`prompt`, `prompt2`,
   *  `prompt${k+1}`) so each lights `PROV_INPUT` and the InputNote hover is two-way. */
  const promptProv = (field: ProvField = 'prompt'): string[] | undefined => {
    const keys = tag(field, hasReads && 'reads') ?? []
    const all = hasInput ? [...keys, PROV_INPUT] : keys
    return all.length ? all : undefined
  }

  switch (node.type) {
    case 'agent': {
      const agent = findAgent(spec, node.agent)
      if (!agent) return danglingAgent(node.agent)
      const grant = node.grants && node.grants[0]
      if (grant) {
        // A+ capped delegation: the lead is schema-forced to { context, items }, then a
        // capped fan-out of the granted agent works the exact item list — each grantee gets
        // the lead's shared context (intra-phase, so it can't be expressed as a read).
        const grantee = findAgent(spec, grant.agent)
        if (!grantee) return danglingAgent(grant.agent)
        return {
          lines: [
            phaseHead,
            P(`const ${outVar}_lead = await agent(`),
            P(`  ${js(agent.prompt)}${reads},`, promptProv()),
            P(
              `  ${agentOpts(agent.model, agent.name, ['schema: FANOUT_SCHEMA'])},`,
              tag('model', 'schema'),
            ),
            P(`)`),
            P(
              `// A+ capped delegation → ${grantee.name}, bounded to ${grant.cap} instance(s).`,
              tag('grant-cap'),
            ),
            P(`const ${outVar} = (await parallel(`),
            P(
              `  ${outVar}_lead.items.slice(0, ${grant.cap}).map((item) => () =>`,
              tag('grant-cap'),
            ),
            P(`    agent(`),
            P(
              `      ${js(grantee.prompt)} + ${js(`\n\n[${agent.name} context]\n`)} + ${outVar}_lead.context + "\\n\\nDelegated sub-task:\\n" + asText(item),`,
              tag('prompt2'),
            ),
            P(`      ${agentOpts(grantee.model, grantee.name)},`, tag('model2')),
            P(`    ),`),
            P(`  ),`),
            P(`)).filter(Boolean)`),
          ],
          outVar,
        }
      }
      return {
        lines: [
          phaseHead,
          P(`const ${outVar} = await agent(`),
          P(`  ${js(agent.prompt)}${reads},`, promptProv()),
          P(
            `  ${agentOpts(agent.model, agent.name, forcedExtra)},`,
            tag('model', info.schemaForced && 'schema'),
          ),
          P(`)`),
        ],
        outVar,
      }
    }
    case 'fanout': {
      const agent = findAgent(spec, node.agent)
      if (!agent) return danglingAgent(node.agent)
      // Dynamic-N bounded by cap: slice the item list to `cap` (a REAL bound — `parallel`
      // only caps *concurrency*, so we cap the item count ourselves).
      return {
        lines: [
          phaseHead,
          P(`const ${outVar} = (await parallel(`, tag('model')),
          P(
            `  ${itemsExpr(index, infos)}.slice(0, ${node.cap}).map((item) => () =>`,
            tag('cap'),
          ),
          P(`    agent(`),
          P(
            `      ${js(agent.prompt)}${reads} + "\\n\\nYour assigned item:\\n" + asText(item),`,
            promptProv(),
          ),
          P(`      ${agentOpts(agent.model, agent.name)},`, tag('model')),
          P(`    ),`),
          P(`  ),`),
          P(`)).filter(Boolean)`),
        ],
        outVar,
      }
    }
    case 'iterateUntil': {
      // V1 loops wrap a single body agent. Repeat it up to `maxIter`, carrying state forward;
      // stop early when the agent reports `done` via a structured {done, output} schema — a
      // real, runtime-enforced break condition (not an LLM-judged prose "until").
      if (node.body.type !== 'agent') {
        return {
          lines: [
            phaseHead,
            P(
              `throw new Error(${js(`Loop body "${node.body.type}" is not supported — V1 loops wrap a single agent.`)})`,
            ),
          ],
          outVar,
        }
      }
      const agent = findAgent(spec, node.body.agent)
      if (!agent) return danglingAgent(node.body.agent)
      return {
        lines: [
          phaseHead,
          P(`let ${outVar} = ""`),
          P(`for (let i = 0; i < ${node.maxIter}; i++) {`, tag('iters')),
          P(`  const it = await agent(`),
          P(
            `    ${js(agent.prompt)}${reads} + "\\n\\nIteration " + (i + 1) + " of ${node.maxIter}." + (i === 0 ? "" : "\\nPrior state:\\n" + asText(${outVar})),`,
            promptProv(),
          ),
          P(`    ${agentOpts(agent.model, agent.name, ['schema: LOOP_SCHEMA'])},`, tag('model')),
          P(`  )`),
          P(`  if (it == null) break`),
          P(`  ${outVar} = it.output`),
          P(`  if (it.done) break`),
          P(`}`),
        ],
        outVar,
      }
    }
    case 'mapReduce': {
      const mapAgent = findAgent(spec, node.map.agent)
      if (!mapAgent) return danglingAgent(node.map.agent)
      const reduceAgent = findAgent(spec, node.reduce)
      if (!reduceAgent) return danglingAgent(node.reduce)
      return {
        lines: [
          phaseHead,
          P(`const ${outVar}_mapped = (await parallel(`),
          P(
            `  ${itemsExpr(index, infos)}.slice(0, ${node.map.cap}).map((item) => () =>`,
            tag('cap'),
          ),
          P(`    agent(`),
          P(
            `      ${js(mapAgent.prompt)}${reads} + "\\n\\nYour assigned item:\\n" + asText(item),`,
            promptProv(),
          ),
          P(`      ${agentOpts(mapAgent.model, mapAgent.name)},`, tag('model')),
          P(`    ),`),
          P(`  ),`),
          P(`)).filter(Boolean)`),
          P(`const ${outVar} = await agent(`),
          P(
            `  ${js(reduceAgent.prompt)}${reads} + "\\n\\nItems to merge:\\n" + asText(${outVar}_mapped),`,
            promptProv('prompt2'),
          ),
          P(
            `  ${agentOpts(reduceAgent.model, reduceAgent.name, forcedExtra)},`,
            tag('model2', info.schemaForced && 'schema'),
          ),
          P(`)`),
        ],
        outVar,
      }
    }
    case 'adversarial': {
      const producer = findAgent(spec, node.producer)
      if (!producer) return danglingAgent(node.producer)
      const critic = findAgent(spec, node.critic)
      if (!critic) return danglingAgent(node.critic)
      return {
        lines: [
          phaseHead,
          P(`const ${outVar}_draft = await agent(`),
          P(`  ${js(producer.prompt)}${reads},`, promptProv()),
          P(`  ${agentOpts(producer.model, producer.name)},`, tag('model')),
          P(`)`),
          P(`const ${outVar}_critique = await agent(`),
          P(
            `  ${js(critic.prompt)}${reads} + "\\n\\nProposal to critique:\\n" + asText(${outVar}_draft),`,
            promptProv('prompt2'),
          ),
          P(`  ${agentOpts(critic.model, critic.name)},`, tag('model2')),
          P(`)`),
          P(`const ${outVar} = { draft: ${outVar}_draft, critique: ${outVar}_critique }`),
        ],
        outVar,
      }
    }
    case 'refine': {
      // Bounded revise loop: draft → judge ({approved, critique}, runtime-enforced) →
      // revise against the critique, stopping early on approval. The phase's memory is the
      // last draft — the critique is *acted on*, not carried downstream.
      const producer = findAgent(spec, node.producer)
      if (!producer) return danglingAgent(node.producer)
      const critic = findAgent(spec, node.critic)
      if (!critic) return danglingAgent(node.critic)
      return {
        lines: [
          phaseHead,
          P(`let ${outVar} = ""`),
          P(`let ${outVar}_note = ""`),
          P(`for (let i = 0; i < ${node.maxIter}; i++) {`, tag('iters')),
          P(`  const draft = await agent(`),
          P(
            `    ${js(producer.prompt)}${reads} + "\\n\\nRevision " + (i + 1) + " of ${node.maxIter}." + (i === 0 ? "" : "\\n\\nYour previous draft:\\n" + asText(${outVar}) + "\\n\\nCritique to address:\\n" + asText(${outVar}_note)),`,
            promptProv(),
          ),
          P(`    ${agentOpts(producer.model, producer.name)},`, tag('model')),
          P(`  )`),
          P(`  if (draft == null) break`),
          P(`  ${outVar} = draft`),
          P(`  const verdict = await agent(`),
          P(
            `    ${js(critic.prompt)}${reads} + "\\n\\nDraft to judge:\\n" + asText(${outVar}),`,
            promptProv('prompt2'),
          ),
          P(`    ${agentOpts(critic.model, critic.name, ['schema: REFINE_SCHEMA'])},`, tag('model2')),
          P(`  )`),
          P(`  if (verdict == null || verdict.approved) break`),
          P(`  ${outVar}_note = verdict.critique`),
          P(`}`),
        ],
        outVar,
      }
    }
    case 'verify': {
      // Per-item refuter jury: every (capped) item gets `votes` independent skeptics, each
      // runtime-enforced to {refuted, reason}; a deterministic in-script majority gate then
      // keeps only items whose refutals are a strict minority. Memory = the survivors.
      const skeptic = findAgent(spec, node.skeptic)
      if (!skeptic) return danglingAgent(node.skeptic)
      const voteLabel = `${js(skeptic.name + ' (vote ')} + (k + 1) + ${js(')')}`
      return {
        lines: [
          phaseHead,
          P(`const ${outVar}_pool = ${itemsExpr(index, infos)}.slice(0, ${node.cap})`, tag('cap')),
          P(`const ${outVar}_verdicts = await parallel(`),
          P(`  ${outVar}_pool.map((item) => () =>`),
          P(`    parallel(`),
          P(`      Array.from({ length: ${node.votes} }, (_, k) => () =>`, tag('votes')),
          P(`        agent(`),
          P(
            `          ${js(skeptic.prompt)}${reads} + "\\n\\nVote " + (k + 1) + " of ${node.votes} — independent take. Item to refute:\\n" + asText(item),`,
            promptProv(),
          ),
          P(
            `          ${optsExprDynamicLabel(skeptic.model, voteLabel, ['schema: VERDICT_SCHEMA'])},`,
            tag('model'),
          ),
          P(`        ),`),
          P(`      ),`),
          P(`    ),`),
          P(`  ),`),
          P(`)`),
          P(`// Majority gate (deterministic, in-script): keep an item only when its refutals are a strict minority of the votes returned.`),
          P(`const ${outVar} = ${outVar}_pool.filter((item, i) => {`),
          P(`  const vs = (${outVar}_verdicts[i] || []).filter(Boolean)`),
          P(`  return vs.filter((v) => v.refuted).length * 2 < vs.length`),
          P(`})`),
        ],
        outVar,
      }
    }
    case 'branches': {
      // Heterogeneous parallel: every branch agent runs ONCE, all at the same time, each
      // receiving the same reads plus its own prompt. The result array is NOT filtered —
      // it stays aligned with the branch order so readers can splice `[label] + p[k]`
      // blocks by index (a failed branch shows up loud as null, never shifts its siblings).
      const agents = node.branches.map((ref) => findAgent(spec, ref))
      const missing = agents.findIndex((a) => !a)
      if (missing >= 0) return danglingAgent(node.branches[missing])
      const lines: EmitLine[] = [phaseHead, P(`const ${outVar} = await parallel([`)]
      agents.forEach((agent, k) => {
        const promptField: ProvField = k === 0 ? 'prompt' : `prompt${k + 1}`
        const modelField: ProvField = k === 0 ? 'model' : `model${k + 1}`
        lines.push(
          P(`  () => agent(`),
          P(`    ${js(agent!.prompt)}${reads},`, promptProv(promptField)),
          P(`    ${agentOpts(agent!.model, agent!.name)},`, tag(modelField)),
          P(`  ),`),
        )
      })
      lines.push(P(`])`))
      return { lines, outVar }
    }
    case 'multiAngle': {
      const worker = findAgent(spec, node.agent)
      if (!worker) return danglingAgent(node.agent)
      const voter = findAgent(spec, node.vote)
      if (!voter) return danglingAgent(node.vote)
      const angleLabel = `${js(worker.name + ' (angle ')} + (k + 1) + ${js(')')}`
      return {
        lines: [
          phaseHead,
          P(`const ${outVar}_takes = (await parallel(`),
          P(`  Array.from({ length: ${node.angles} }, (_, k) => () =>`, tag('angles')),
          P(`    agent(`),
          P(
            `      ${js(worker.prompt)}${reads} + "\\n\\nAngle " + (k + 1) + " of ${node.angles}.",`,
            promptProv(),
          ),
          P(`      ${optsExprDynamicLabel(worker.model, angleLabel)},`, tag('model')),
          P(`    ),`),
          P(`  ),`),
          P(`)).filter(Boolean)`),
          P(`const ${outVar} = await agent(`),
          P(
            `  ${js(voter.prompt)}${reads} + "\\n\\nCandidate answers:\\n" + asText(${outVar}_takes),`,
            promptProv('prompt2'),
          ),
          P(
            `  ${agentOpts(voter.model, voter.name, forcedExtra)},`,
            tag('model2', info.schemaForced && 'schema'),
          ),
          P(`)`),
        ],
        outVar,
      }
    }
    default:
      // Only a nested `sequence` reaches here (all leaf patterns are handled). Fail loud
      // rather than emit a silently-incomplete workflow.
      return {
        lines: [
          phaseHead,
          P(
            `throw new Error(${js(`Pattern "${node.type}" is not supported at the top level — flatten it in the editor.`)})`,
          ),
        ],
        outVar,
      }
  }
}

/** Small runtime helpers, emitted only when the body actually references them. */
function helpers(need: {
  toItems: boolean
  asText: boolean
  loopSchema: boolean
  fanoutSchema: boolean
  refineSchema: boolean
  verdictSchema: boolean
}): EmitLine[] {
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
  if (need.refineSchema) {
    out.push(
      '// A refine judge approves the draft or returns the critique the next revision must address.',
      'const REFINE_SCHEMA = {',
      '  type: "object",',
      '  properties: {',
      '    approved: { type: "boolean", description: "true when the draft passes as-is; stops the revision loop" },',
      '    critique: { type: "string", description: "actionable critique the producer must address in its next revision (empty when approved)" },',
      '  },',
      '  required: ["approved", "critique"],',
      '}',
    )
  }
  if (need.verdictSchema) {
    out.push(
      '// A verify skeptic casts one refutation vote on one item. Be skeptical: refute unless',
      '// the item clearly survives scrutiny.',
      'const VERDICT_SCHEMA = {',
      '  type: "object",',
      '  properties: {',
      '    refuted: { type: "boolean", description: "true when the item does not hold up under scrutiny" },',
      '    reason: { type: "string", description: "one-sentence justification for this verdict" },',
      '  },',
      '  required: ["refuted", "reason"],',
      '}',
    )
  }
  return out.map((t) => ln(t))
}

/**
 * The `meta` block. `detail` surfaces model, reads, and forced shapes on approval.
 * The name/description lines carry PROV_NAME; each phase line carries that phase's `model`
 * key (the detail renders "name → model", so the model field genuinely produced it).
 */
function renderMeta(
  spec: WorkflowSpec,
  infos: PhaseInfo[],
  byId: Map<string, number>,
): EmitLine[] {
  const lines: EmitLine[] = [
    ln('export const meta = {'),
    ln(`  name: ${js(spec.name)},`, [PROV_NAME]),
    ln(`  description: ${js(spec.name)},`, [PROV_NAME]),
    ln('  phases: ['),
  ]
  infos.forEach((info, i) => {
    const id = 'id' in info.node ? info.node.id : undefined
    lines.push(
      ln(
        `    { title: ${js(`Phase ${i + 1}`)}, detail: ${js(phaseDetail(spec, infos, byId, i))} },`,
        id ? [provKey(id, 'model')] : undefined,
      ),
    )
  })
  lines.push(ln('  ],'))
  lines.push(ln('}'))
  return lines
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
    case 'refine':
      base = `refine — ${who(spec, node.producer)} ⇄ ${who(spec, node.critic)} (revise until approved, ≤ ${node.maxIter})`
      break
    case 'verify':
      base = `verify — ${who(spec, node.skeptic)} ×${node.votes} votes per item (majority gate, cap ${node.cap})`
      break
    case 'branches':
      base = `branches — ${node.branches.map((ref) => who(spec, ref)).join(' ∥ ')} (parallel, once each)`
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

/**
 * Build the complete runtime-valid workflow script for a spec as provenance-tagged line
 * records. Pure; never mutates. `emitScript` is exactly `emitScriptLines(...).map(text).join`,
 * so the joined text is byte-identical to the pre-refactor emitter (golden-snapshot guarded).
 */
export function emitScriptLines(spec: WorkflowSpec): EmitLine[] {
  const phases = spec.root.type === 'sequence' ? spec.root.steps : [spec.root]
  const infos = buildPhaseInfos(spec, phases)
  const byId = phaseIndexById(phases)

  const header: EmitLine[] = [
    ln(`// Dynamic workflow — generated by Runorder (one-way export; edit the spec, not this file).`),
    ln(`// Target: ${RUNTIME_TAG}`),
    ln(
      `// Caps — concurrency ${spec.caps.concurrency}, total ${spec.caps.total} (fan-out counts are capped in-script; concurrency is the runtime's global cap).`,
      [PROV_CAPS],
    ),
    ln(
      `// Context flow is explicit: each agent receives ONLY the [memory] blocks its phase reads (plus its pattern's own piping).`,
    ),
  ]
  const input = launchInput(spec)
  if (input) {
    const desc = input.description ? ` — ${input.description}` : ''
    // How the input reaches phase 1: a fan-out/map/verify first phase consumes it as items;
    // any other first phase gets it as a labeled `[label]` prose block.
    const how =
      phases.length && consumesItems(phases[0])
        ? `split into the items phase 1 fans out over`
        : `spliced into phase 1 as a [${input.label}] block`
    header.push(ln(`// Launch input (args): ${input.label}${desc} — ${how}.`, [PROV_INPUT]))
  }

  const rendered = phases.map((_, i) => renderPhase(spec, infos, byId, i))
  const lastVar = rendered.length ? rendered[rendered.length - 1].outVar : null

  // Phases are separated by exactly one blank line (matching the old `join('\n\n')`).
  const bodyLines: EmitLine[] = []
  rendered.forEach((r, i) => {
    if (i > 0) bodyLines.push(ln(''))
    bodyLines.push(...r.lines)
  })
  const body = bodyLines.map((l) => l.text).join('\n')
  const ret = lastVar ? `return ${lastVar}` : 'return null'

  // Helpers are gated on actual references in the emitted body (DRY with the render pass).
  const need = {
    toItems: body.includes('toItems('),
    asText: body.includes('asText('),
    loopSchema: body.includes('LOOP_SCHEMA'),
    fanoutSchema: body.includes('FANOUT_SCHEMA'),
    refineSchema: body.includes('REFINE_SCHEMA'),
    verdictSchema: body.includes('VERDICT_SCHEMA'),
  }

  const out: EmitLine[] = [...header, ln(''), ...renderMeta(spec, infos, byId)]
  if (Object.values(need).some(Boolean)) out.push(ln(''), ...helpers(need))
  out.push(ln(''), ...bodyLines, ln(''), ln(ret))

  return out
}

/** Build the complete runtime-valid workflow script text. Byte-identical to the line join. */
export function emitScript(spec: WorkflowSpec): string {
  return emitScriptLines(spec)
    .map((l) => l.text)
    .join('\n')
}
