# Playsheet

**See and pin your Claude Code workflow before it runs.**

Playsheet is a client-side web app that lets Claude Code users **configure a multi-agent
orchestration in a GUI and export it as a Claude Code native "dynamic workflow"** — the
runtime-executed `.js` orchestration feature (triggered with `ultracode` / "run as a workflow"),
**not** the standalone Claude Agent SDK.

The point is **visibility and predictability**: which model each subagent uses, how many run,
and the topology — the things a Claude-written workflow normally hides. You compose the workflow
in a worksheet-style editor, watch a dry-run rehearsal of what will spawn, and export a script
you review on Claude Code's own approval screen before anything runs.

## Status

**MVP core implemented; script-first.** The full data path (spec model → state → emitters), the
Studio editor UI, local save/library, and JSON export/import are built and tested (215 tests;
typecheck/build clean). Live probe runs against the real dynamic-workflow runtime confirmed that
per-stage `agent({ model })` routing is enforced and that unknown model ids fail loud — so the
**script emitter is primary**, with the prompt emitter kept as a durable fallback.

The editor covers **ten orchestration patterns** — sequence, fan-out, branches, loop, map-reduce,
adversarial, refine, verify, multi-angle, and delegation. Seven are proven by real runtime runs;
refine, verify, and branches are implemented full-vertical but not yet run-proven, and their
shelf cards say so. See **Next steps** in [`CLAUDE.md`](./CLAUDE.md) for the current gate.

## Quickstart

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest (single run)
npm run build      # typecheck + static dist/ (Cloudflare Pages target)
npm run lint       # ESLint
```

## How it works

The product is **one canonical spec model with projections hanging off it** — the single source
of truth. Data flows model → state → output:

| Layer | Location |
|---|---|
| Canonical spec model (Zod) + graph validation + seed | `src/spec/` |
| Live state (Zustand + Immer) + saved library | `src/store/` |
| Script emitter — **primary**, runtime-valid `.js`, provenance-tagged lines | `src/emit/scriptEmitter.ts` |
| Prompt emitter — durable structured-Markdown fallback | `src/emit/promptEmitter.ts` |
| Shared enforcement predicates (what the script really injects) | `src/emit/plumbing.ts` |
| Studio UI — worksheet, pattern shelf, rehearsal view, receipt column | `src/components/studio/` |
| Pattern vocabulary, memory names, rehearsal derivation, provenance keys | `src/lib/` |
| Autosave, named library, JSON export/import | `src/io/` |

Pipeline plumbing is auto-injected: context flows between phases through **named memories**
(each node's `reads` are spliced into its prompts as labeled blocks), and producers feeding a
fan-out are **schema-forced** to return `{ context, items }` so consumers map an exact array.
You write only *what each agent does*; the tool wires the data flow.

Two rules keep the output honest:

- **Exports are one-way.** The model is authoritative and is never reconstructed from an edited
  artifact.
- **Intent vs. guarantee is labeled.** The UI only shows an "enforced" badge for what the emitted
  script actually pins (per-agent model, caps, schemas) — never for what is merely requested.

## Documentation

| File | Contents |
|---|---|
| [`ProductDescription.md`](./ProductDescription.md) | Problem, audience, value prop, conceptual model, target runtime, non-goals |
| [`Architecture.md`](./Architecture.md) | Canonical model + projections, the two emitters, editing paradigm, pattern vocabulary, schema |
| [`MVP.md`](./MVP.md) | The V1 cut (in/out of scope), validation rules, build order, the proof |
| [`OpenQuestions.md`](./OpenQuestions.md) | Empirical unknowns to resolve by running real workflows |
| [`CLAUDE.md`](./CLAUDE.md) | Working guidance, code map, guardrails, and **Next steps** |
| `mockups/` | UI-direction mockups; mockup 16 ("Studio") is the shipped direction |

## Tech stack

TypeScript · React · Vite · Zod · Zustand + Immer · Tailwind v4 + shadcn/ui (Base UI) ·
Vitest + React Testing Library · ESLint + Prettier. Pure static SPA (no backend in V1); deploys
to Cloudflare Pages.

## License

[MIT](./LICENSE)
