# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**MVP core implemented; first runtime proof run (2026-07-02) — pivoting to script-first.** The full non-UI data path and the editor UI are built and tested. A live probe against the real dynamic-workflow runtime confirmed per-stage `agent({ model })` routing works and that unknown model ids fail *loud* (no silent session-model fallback) — resolving the core of OpenQuestions #1/#5 (see `OpenQuestions.md`, Findings 2026-07-02). On that basis the **script emitter is now built and primary** (`src/emit/scriptEmitter.ts`), with the prompt emitter demoted to a durable fallback. The design/specification docs remain the source of truth for *what* the product is.

**Pipeline plumbing is now auto-injected (designed + implemented 2026-07-02, run-proof pending).** A first-user test (a story-generation workflow) exposed two authoring pain points: context silently lost between phases, and fan-out producers not returning lists. Both are now the tool's job — the user writes only *what each agent does*: (1) **explicit context flow via named memories** — every root phase's output is a named memory (`src/lib/memoryNames.ts`); each node's `reads` (node-id refs, defaulted on creation, edited as chips in the worksheet's flow notes) are spliced into its prompts as labeled `[name]` blocks; nothing flows implicitly; (2) **enforced fan-out handoff** — a producer feeding a fan-out/map (or a delegation lead) is schema-forced to `{ context, items }` (`FANOUT_SCHEMA`, same run-validated seam as `LOOP_SCHEMA`), so consumers map an exact array and `toItems` is only a fallback for args/loop/adversarial inputs. Design rationale (incl. why read-all and agent-written memory *files* were rejected) is in the 2026-07-02 plan; key rule of thumb: **big data flows through items, small shared context through reads.**

| Layer | Where | Notes |
|---|---|---|
| Canonical spec model | `src/spec/` | `schema.ts` (Zod model + `z.infer` types; nodes carry optional `id` + `reads`), `validate.ts` (graph pass: dangling-ref, delegation-cycle, dangling/forward reads, duplicate node ids), `seed.ts` (the `code-review-loop` example, reads wired) |
| State | `src/store/workflowStore.ts`, `src/store/uiStore.ts` | Zustand + Immer; the single live `WorkflowSpec`; one generic `insertPattern(kind, index)` mints fresh role-named agents (deduped) with reads from the insertion point (`defaultReadsAt`); unreferenced agents GC'd on remove/retarget (`src/lib/nodeRoles.ts`); `uiStore` holds view-only state (view, receipt tab, drag, prov hover, rehearsal sampleN) |
| Script emitter (primary) | `src/emit/scriptEmitter.ts` | deterministic runtime-valid `.js` (`meta`/`phase`/`agent({model})`/`parallel`); models executed literally = enforced; fan-out capped in-script; reads spliced as `[name]` blocks; producers feeding fan-outs forced to `FANOUT_SCHEMA`; dangling refs/reads `throw`; version-tagged (`RUNTIME_TAG`); golden-snapshot guarded. Primary builder is `emitScriptLines(spec): EmitLine[]` (provenance-tagged line records via `src/lib/prov.ts`); `emitScript` is its byte-identical join |
| Prompt emitter (fallback) | `src/emit/promptEmitter.ts` | deterministic single structured-Markdown artifact; durable across API churn but Claude authors the orchestration (model pin + reads/list-format are *requests*); golden inline-snapshot guarded |
| Shared plumbing predicates | `src/emit/plumbing.ts` | `isSchemaForced` etc. — one source of truth for both emitters and the UI's ENFORCED badge (never claim enforcement the script doesn't inject) |
| Editor UI (Studio) | `src/components/studio/` | the Studio design (`mockups/16-studio.html`, shipped 2026-07-03): light-mode worksheet document with edit-in-place tokens + prose phase sentences, playbook shelf (drag patterns into seams; fresh agents pre-wired), read-only rehearsal view (`rehearsal/`), receipt column with two-way hover provenance (worksheet field ⇄ emitted line). Light "paper" theme in `src/index.css` |
| Shared helpers | `src/lib/` | `models.ts` (bundled Claude family + alias/family helpers), `memoryNames.ts` (derived, deduped memory names), `estimate.ts` (run-size estimate), `patterns.ts` (pattern vocabulary + shelf copy), `nodeRoles.ts` (role refs + referenced-agent walk), `rehearse.ts` (pure dry-run derivation mirroring the emitter), `prov.ts` (provenance keys shared by emitter + UI) |

Test suite: **157 passing** (schema, store, validation, memory names, both emitter snapshots + emit-lines provenance, rehearse derivation, RTL UI incl. rehearsal + receipt hover). `npm run typecheck` / `lint` / `build` all clean.

**Proven by running (not review):** the emitted script shapes execute end-to-end in the real runtime — fan-out (`toItems` handoff, caught under-splitting a plain-newline list and fixed), **loop** (`iterateUntil` → bounded `for` + `{done, output}` schema break; stopped early at iteration 3 of 5), **map-reduce** (parallel map [2,3,4]→[4,6,8] → reduce sum 18), and **multi-angle** (3 parallel takes → vote picked the max). The topology editor now covers **all seven patterns** (step / fan-out / loop / map-reduce / adversarial / multi-angle / A+ delegation); grant delegation turns on real cycle detection in `validate.ts`. **Still open:** the *prompt-path* faithfulness (#3/#4) is untested (the proofs exercised the script path); the string→items handoff is a heuristic (robust upgrade = give producers an output schema). See **Next steps**.

## Next steps

Priority order. Step 1 is the real MVP gate; the rest are deferred extensions, each additive (none requires redesigning the core model). *(The Studio UI redesign — formerly step 2 — shipped 2026-07-03: worksheet document, playbook shelf with drag-to-insert, read-only rehearsal view, receipt column with two-way hover provenance, light paper theme.)*

1. **Run-prove the new plumbing, then finish the verify loop for the seed's real workload.** The plumbing (reads splice + `FANOUT_SCHEMA` forcing) is implemented and snapshot-guarded but **not yet run-proven** — the acceptance gate is re-emitting the story workflow (or the seed) and running it: confirm the exact-N fan-out and that a late phase's input actually contains the read memories (e.g. Writer sees setting+cast+goal+obstacles). Then the **full `code-review-loop`** against an actual diff, and `OpenQuestions.md` #3/#4 for the *prompt* path (structured-Markdown faithfulness — now including whether Claude honors the reads/list-format prose). Ground truth is the run, **not** Claude's "looks right".
2. **Deploy** the static `dist/` to Cloudflare Pages.
3. **V1.1 — generated graph view:** the deferred headline visibility artifact (React Flow / `@xyflow`), a *derived* projection of the model (always correct because derived, never drawn).
4. **V2 — script emitter:** the fragile second emitter (saved `/<name>` command). Reverse-engineer the undocumented runtime API, version-tag to a Claude Code release, validate by **running fixtures** — never by Claude's review.
5. **Further deferred:** per-agent tools (pending a runtime-enforcement check), persistence/templates/sharing, richer memories (multi-field producer schemas, custom memory names). *(The seven-pattern vocabulary — sequence, fan-out, loop, map-reduce, adversarial, multi-angle, A+ delegation — is implemented and run-validated; the per-producer `{ context, items }` output schema and explicit reads are implemented, pending run-proof.)*

## What this is

**Prewire** (product name; primary URL `prewire.dev`) — *see and pin your Claude Code workflow before it runs.* A web app that lets semi-advanced Claude Code users **configure a multi-agent orchestration in a GUI and export it as a Claude Code native "dynamic workflow"** — the runtime-executed `.js` orchestration feature (triggered with `ultracode` / "run as a workflow"), **not** the standalone Claude Agent SDK. The point is *visibility and predictability*: which model each subagent uses, how many run, and the topology — the things a Claude-written workflow normally hides.

## Knowledge map

| File | Contents |
|---|---|
| `ProductDescription.md` | Problem, audience, value prop, conceptual model ("A+"), target runtime, contract, non-goals |
| `Architecture.md` | Canonical spec model + 3 projections, the two emitters, editing paradigm, pattern vocabulary, V1 node fields, draft schema, Claude Code runtime reference |
| `MVP.md` | The V1 cut (in/out of scope), validation rules, build order, the manual verify loop |
| `OpenQuestions.md` | Empirical unknowns to resolve by experiment (not by guessing), plus remaining undecided choices (tech stack now resolved — see below) |

## Tech stack

Chosen 2026-06-17. The app is a **pure client-side static SPA — no backend in V1** (persistence/auth/sharing are out of scope per `MVP.md`; a backend can be added later via Cloudflare Pages Functions if monetization needs it).

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript** | The product *is* a typed data model + serializers; non-negotiable |
| Framework | **React** | Best-supported for AI-assisted dev; graph view (deferred) is React-first via `@xyflow`/React Flow |
| Build tool | **Vite** (`react-ts` template) | No meta-framework — there's no server/SSR/routing need |
| Spec model + validation | **Zod** | Schemas are the source of the model; derive TS types via `z.infer`. Validate at the load-from-disk boundary. Graph rules (no dangling refs, no cycles) are a **separate** validation pass — not expressible in Zod |
| State | **Zustand + Immer middleware** | One canonical nested spec tree; Immer for ergonomic nested updates; store is readable directly by emitters |
| Forms | **No forms library** | Controlled inputs bound directly to the Zustand store (the single source of truth); validation via Zod over the whole model. RHF/Formik would create a competing second state store |
| Styling / components | **Tailwind + shadcn/ui** (Radix) | Accessible combobox for the model picker (dropdown + raw-id escape + "inherit"); components copied into repo → no lock-in, restyle freely |
| Testing | **Vitest + React Testing Library** | Weight on emitter snapshot/unit tests (feed specs → assert emitted text). Playwright (E2E) deferred. **These are regression guards, not faithfulness validation** — ground truth is the manual run loop |
| Lint / format | **ESLint + Prettier** | Template ships ESLint; add Prettier + `eslint-config-prettier`. Chosen for ecosystem/AI-assist alignment over Biome |
| Package manager | **npm** | Universal default; ships with Node |
| Hosting | **Cloudflare Pages** | Static deploy; Pages Functions is the future-backend seam |

## Commands

Scaffolded 2026-06-17 (Vite `react-ts`). All commands verified working:

- `npm run dev` — Vite dev server (validate the proof from `localhost`)
- `npm run build` — typecheck (`tsc -b`) then produce static `dist/` for Cloudflare Pages
- `npm run preview` — serve the built `dist/` locally
- `npm run typecheck` — `tsc -b` (no emit; tsconfigs set `noEmit`)
- `npm test` — Vitest single run; `npm test -- <file>` for one file; `npm run test:watch` / `npm run test:ui` for interactive
- `npm run lint` — ESLint (flat config; `src/components/ui` is ignored — shadcn-generated)
- `npm run format` / `npm run format:check` — Prettier (ignores `*.md` and `src/components/ui`)

### Layout / conventions

- `@/*` path alias → `src/*` (set in `vite.config.ts`, `tsconfig.app.json`, `tsconfig.json`).
- `src/spec/`, `src/store/`, `src/emit/` — the model → state → output data path; tests are co-located (`*.test.ts`).
- `src/components/studio/` — the Studio editor (one component per part: `Worksheet`/`PhaseSentence`/`FlowNote` tokens, `Shelf`/`Seam`/`DropEnd` drag-to-insert, `ReceiptColumn` + `useProv`/`ProvSpan` provenance hover, `rehearsal/` subdirectory for the dry-run view); all components are controlled projections of the stores — no second state, no forms library.
- `src/components/ui/` — shadcn/ui components (copied in; not hand-edited, lint/prettier-ignored). Add more via `npx shadcn@latest add <name>`.
- `src/lib/utils.ts` — shadcn `cn()` helper.
- `src/test/setup.ts` — Vitest setup (jest-dom matchers + RTL cleanup); Vitest config lives in `vite.config.ts` (`environment: jsdom`, globals on).
- Design tokens / Tailwind theme: `src/index.css` (Tailwind v4). The shadcn neutral theme stays in the `@theme inline` block; the Studio **light "paper"** palette (paper/rule/ink scale, model-family hues darkened for a light background, enforced/intended honesty colors, IBM Plex Sans + Mono) is a second `@theme` block exposed as utilities (`bg-paper`, `text-ink`, `text-opus`, …), mirroring the mockup-16 `:root`. No forced dark. shadcn uses **Base UI** (`@base-ui/react`), the successor to Radix; the model picker (`ModelToken`) is built on `@base-ui/react/combobox`.
- **Validation is continuous:** the TopBar status pill is derived live from `validateSpec` every render — there is no separate "Validate" button (it would be a no-op).

## Non-negotiable guardrails (do not violate when implementing)

These are load-bearing decisions from the design phase; breaking them undoes the product's reason to exist.

1. **The internal spec model is the single source of truth.** The prompt artifact, the script artifact, and the graph are all *projections* of it. Exports are **one-way** — never support re-importing a hand-edited generated script back into the model.
2. **Target Claude Code's native dynamic-workflow runtime, not the Agent SDK.** The runtime executes the emitted JS literally.
3. **Two emitters, built in parallel:** the durable **prompt emitter** (primary) and the fragile **script emitter** (targets an undocumented, fast-moving API — reverse-engineer it, version-tag it to a Claude Code release, and validate it by *actually running* fixtures, never by Claude's "does this look right?").
4. **Human-in-the-loop contract:** the tool emits → the user reviews/approves on Claude Code's own approval screen → it runs. The tool makes faithfulness *likely and verifiable*, never *guaranteed*. Don't build features that assume autonomous, unverified execution.
5. **Don't claim enforcement you haven't verified.** Per-agent *model* is runtime-enforced; per-agent *tools* may not be (V1 omits tools entirely). Label intent vs. guarantee honestly in the UI.
