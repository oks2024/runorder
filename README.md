# Dynamic Workflow Editor

A client-side web app that lets semi-advanced Claude Code users **configure a multi-agent
orchestration in a GUI and export it as a Claude Code native "dynamic workflow"** — the
runtime-executed orchestration feature (triggered with `ultracode` / "run as a workflow"),
**not** the standalone Claude Agent SDK.

The point is **visibility and predictability**: which model each subagent uses, how many run,
and the topology — the things a Claude-written workflow normally hides. You build the spec in a
form, and the tool emits a single structured-Markdown artifact you paste into Claude Code, review
on its approval screen, and run.

## Status

**MVP core implemented (2026-06-20); the manual run-and-verify proof is pending.** The spec model,
state, prompt emitter, and editor UI are built and tested (39 tests; typecheck/lint/build clean).
What remains for the MVP is to actually run an emitted artifact in Claude Code and diff the
approval screen against the spec. See **Next steps** in [`CLAUDE.md`](./CLAUDE.md).

## Quickstart

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest (single run)
npm run build      # typecheck + static dist/ (Cloudflare Pages target)
npm run lint       # ESLint
```

## How it works

The product is **one canonical spec model with projections hanging off it** — the single source of
truth. Data flows model → state → output:

| Layer | Location |
|---|---|
| Canonical spec model (Zod) + graph validation + seed | `src/spec/` |
| Live state (Zustand + Immer) | `src/store/workflowStore.ts` |
| Prompt emitter (the structured-Markdown artifact) | `src/emit/promptEmitter.ts` |
| Editor UI — three panes (Agents · Composition · Emit) | `src/components/editor/` |
| Bundled model config + helpers | `src/lib/` |

Exports are **one-way**: the model is authoritative and is never reconstructed from an edited
artifact.

## Documentation

| File | Contents |
|---|---|
| [`ProductDescription.md`](./ProductDescription.md) | Problem, audience, value prop, conceptual model, target runtime, non-goals |
| [`Architecture.md`](./Architecture.md) | Canonical model + projections, the two emitters, editing paradigm, pattern vocabulary, schema |
| [`MVP.md`](./MVP.md) | The V1 cut (in/out of scope), validation rules, build order, the proof |
| [`OpenQuestions.md`](./OpenQuestions.md) | Empirical unknowns to resolve by running real workflows |
| [`CLAUDE.md`](./CLAUDE.md) | Working guidance, code map, guardrails, and **Next steps** |
| `mockups/` | The seven UI-direction mockups; mockup 7 is the chosen direction |

## Tech stack

TypeScript · React · Vite · Zod · Zustand + Immer · Tailwind v4 + shadcn/ui (Base UI) ·
Vitest + React Testing Library · ESLint + Prettier. Pure static SPA (no backend in V1); deploys to
Cloudflare Pages.
