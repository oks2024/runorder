# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**MVP core implemented (as of 2026-06-20); the manual run-and-verify proof is still pending.** The full non-UI data path and the editor UI are built, tested, and committed on `main`. The design/specification docs remain the source of truth for *what* the product is.

| Layer | Where | Notes |
|---|---|---|
| Canonical spec model | `src/spec/` | `schema.ts` (Zod model + `z.infer` types), `validate.ts` (graph pass: dangling-ref; cycle check is a documented no-op), `seed.ts` (the `code-review-loop` example) |
| State | `src/store/workflowStore.ts` | Zustand + Immer; the single live `WorkflowSpec`; actions for caps, agent CRUD, flat phase-list ops |
| Prompt emitter | `src/emit/promptEmitter.ts` | deterministic single structured-Markdown artifact; golden inline-snapshot guarded |
| Editor UI (mockup 7) | `src/components/editor/` | three panes bound to the store; theme tokens + forced dark in `src/index.css` |
| Shared helpers | `src/lib/` | `models.ts` (bundled Claude family + alias/family helpers), `estimate.ts` (run-size estimate) |

Test suite: **39 passing** (schema, store, emitter snapshot, RTL UI). `npm run typecheck` / `lint` / `build` all clean.

**Not done:** the MVP's actual proof — running the emitted artifact in Claude Code and diffing the approval screen against the spec (the thesis the whole product exists to test). See **Next steps**.

## Next steps

Priority order. Step 1 is the real MVP gate; the rest are deferred extensions, each additive (none requires redesigning the core).

1. **Run the manual verify loop (the MVP proof).** `npm run dev`, load the `code-review-loop` seed, copy the emitted artifact, paste into Claude Code (**v2.1.154+**), and **diff the approval screen** (model per stage, topology, per-stage caps) against the spec. This is what resolves `OpenQuestions.md` #3–#5 (prompt-path faithfulness, whether structured-Markdown is treated as authoritatively as JSON, alias routing). Record findings there. Ground truth is the run, **not** Claude's "looks right".
2. **Eyeball the UI** against `mockups/07-console-editor.html` (combobox popover, layout, dangling state) — built and unit-tested but not yet visually verified in a browser.
3. **Deploy** the static `dist/` to Cloudflare Pages.
4. **V1.1 — generated graph view:** the deferred headline visibility artifact (React Flow / `@xyflow`), a *derived* projection of the model (always correct because derived, never drawn).
5. **V2 — script emitter:** the fragile second emitter (saved `/<name>` command). Reverse-engineer the undocumented runtime API, version-tag to a Claude Code release, validate by **running fixtures** — never by Claude's review.
6. **Further deferred:** the other five patterns (map-reduce, adversarial, multi-angle+vote, iterate-until, A+ capped delegation), per-agent tools (pending a runtime-enforcement check), persistence/templates/sharing, Emit syntax coloring, light mode.

## What this is

A web app that lets semi-advanced Claude Code users **configure a multi-agent orchestration in a GUI and export it as a Claude Code native "dynamic workflow"** — the runtime-executed `.js` orchestration feature (triggered with `ultracode` / "run as a workflow"), **not** the standalone Claude Agent SDK. The point is *visibility and predictability*: which model each subagent uses, how many run, and the topology — the things a Claude-written workflow normally hides.

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
- `src/components/editor/` — the mockup-7 editor (one component per pane/part, e.g. `AgentStrip`, `ModelCombobox`, `PhaseRow`); panes are controlled projections of the store — no second state, no forms library.
- `src/components/ui/` — shadcn/ui components (copied in; not hand-edited, lint/prettier-ignored). Add more via `npx shadcn@latest add <name>`.
- `src/lib/utils.ts` — shadcn `cn()` helper.
- `src/test/setup.ts` — Vitest setup (jest-dom matchers + RTL cleanup); Vitest config lives in `vite.config.ts` (`environment: jsdom`, globals on).
- Design tokens / Tailwind theme: `src/index.css` (Tailwind v4). The shadcn neutral theme stays in the `@theme inline` block; the mockup-7 **dark-only** palette (panel/well/ink scale, model-family hues, enforced/intended honesty colors, IBM Plex Mono) is a second `@theme` block exposed as utilities (`bg-panel`, `text-ink`, `text-opus`, …). Dark is forced via `class="dark"` on `<html>` (`index.html`). shadcn uses **Base UI** (`@base-ui/react`), the successor to Radix; the model picker (`ModelCombobox`) is built on `@base-ui/react/combobox`.
- **Validation is continuous:** the TopBar status pill is derived live from `validateSpec` every render — there is no separate "Validate" button (it would be a no-op).

## Non-negotiable guardrails (do not violate when implementing)

These are load-bearing decisions from the design phase; breaking them undoes the product's reason to exist.

1. **The internal spec model is the single source of truth.** The prompt artifact, the script artifact, and the graph are all *projections* of it. Exports are **one-way** — never support re-importing a hand-edited generated script back into the model.
2. **Target Claude Code's native dynamic-workflow runtime, not the Agent SDK.** The runtime executes the emitted JS literally.
3. **Two emitters, built in parallel:** the durable **prompt emitter** (primary) and the fragile **script emitter** (targets an undocumented, fast-moving API — reverse-engineer it, version-tag it to a Claude Code release, and validate it by *actually running* fixtures, never by Claude's "does this look right?").
4. **Human-in-the-loop contract:** the tool emits → the user reviews/approves on Claude Code's own approval screen → it runs. The tool makes faithfulness *likely and verifiable*, never *guaranteed*. Don't build features that assume autonomous, unverified execution.
5. **Don't claim enforcement you haven't verified.** Per-agent *model* is runtime-enforced; per-agent *tools* may not be (V1 omits tools entirely). Label intent vs. guarantee honestly in the UI.
