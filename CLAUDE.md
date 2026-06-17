# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Scaffolded, no product logic yet (as of 2026-06-17).** The toolchain is in place (Vite + React + TS + Tailwind/shadcn + Zustand/Immer + Zod + Vitest) but no application code beyond a placeholder `App.tsx` exists. The design/specification docs remain the source of truth for *what* to build. Per `MVP.md`'s build order, the first thing to implement is the **canonical spec model / Zod schema** — everything else hangs off it.

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
- `src/components/ui/` — shadcn/ui components (copied in; not hand-edited, lint/prettier-ignored). Add more via `npx shadcn@latest add <name>`.
- `src/lib/utils.ts` — shadcn `cn()` helper.
- `src/test/setup.ts` — Vitest setup (jest-dom matchers + RTL cleanup); Vitest config lives in `vite.config.ts` (`environment: jsdom`, globals on).
- Design tokens / Tailwind theme: `src/index.css` (Tailwind v4, `@theme inline`). shadcn uses **Base UI** (`@base-ui/react`), the successor to Radix.

## Non-negotiable guardrails (do not violate when implementing)

These are load-bearing decisions from the design phase; breaking them undoes the product's reason to exist.

1. **The internal spec model is the single source of truth.** The prompt artifact, the script artifact, and the graph are all *projections* of it. Exports are **one-way** — never support re-importing a hand-edited generated script back into the model.
2. **Target Claude Code's native dynamic-workflow runtime, not the Agent SDK.** The runtime executes the emitted JS literally.
3. **Two emitters, built in parallel:** the durable **prompt emitter** (primary) and the fragile **script emitter** (targets an undocumented, fast-moving API — reverse-engineer it, version-tag it to a Claude Code release, and validate it by *actually running* fixtures, never by Claude's "does this look right?").
4. **Human-in-the-loop contract:** the tool emits → the user reviews/approves on Claude Code's own approval screen → it runs. The tool makes faithfulness *likely and verifiable*, never *guaranteed*. Don't build features that assume autonomous, unverified execution.
5. **Don't claim enforcement you haven't verified.** Per-agent *model* is runtime-enforced; per-agent *tools* may not be (V1 omits tools entirely). Label intent vs. guarantee honestly in the UI.
