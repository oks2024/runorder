# Architecture

## Core principle: one model, many projections

The product is **one canonical spec model with projections hanging off it.** This is what makes the dual-output strategy cheap instead of double work — every output reads the same in-memory model.

```
                ┌─────────────────────────┐
                │  Canonical spec model   │  ← single source of truth
                │  (agents, patterns,     │
                │   topology, caps)       │
                └────────────┬────────────┘
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  Prompt emitter       Script emitter         Graph view
  (durable, primary)   (fragile, V2-ish)      (comprehension)
```

Exports are **one-way**. The model is authoritative; never re-import an edited script.

> **Implementation status (2026-06-20).** This document is the design source of truth; the code now realizes most of it. Built: the canonical model (`src/spec/schema.ts`, `validate.ts`), the Zustand+Immer store (`src/store/workflowStore.ts`), the **prompt emitter** (`src/emit/promptEmitter.ts`), and the form-primary editor (`src/components/editor/`, mockup 7). Still deferred per `MVP.md`: the **graph view** (V1.1) and the **script emitter** (V2). The draft schema below is implemented largely as written (the V1 editor exposes only the `sequence`/`fanout` slice of the full recursive `PatternNode`).

## The two emitters (dual-strategy)

Targeting Claude Code's native dynamic-workflow runtime means the runtime *executes the emitted JS literally* — a near-miss script errors, it is not "understood and adapted." But the runtime API for spawning agents / routing models is **undocumented and fast-moving** (research preview; the trigger keyword already changed `workflow` → `ultracode` between point releases). Hence two emitters:

| | Prompt emitter | Script emitter |
|---|---|---|
| Output | A structured **spec + instruction** Claude turns into a runtime-correct workflow | A runtime-valid `.js` saved as a `/<name>` command |
| Fidelity needed | Low (Claude knows the live API) | Exact (must match undocumented API) |
| Durability | Version-agnostic | Tied to a Claude Code version |
| Role | **Primary / durable fallback** | Upgrade once the API is documented/stable |
| Build status | V1 | Deferred |

**Why both:** the prompt path carries the product from day one and survives API churn; the script path gives byte-exact predictability when it works. The dev loop to build the script emitter is "here's the spec, here's my script attempt, does it match?" — using Claude as the oracle for the undocumented API. **But Claude's review is a dev aid, not validation** — ground truth is running generated workflows across a small fixture matrix. **Version-tag** every emitted script to its target Claude Code release.

### Prompt emitter — faithfulness design

The prompt path is the durable path, so it must be the *most* trustworthy. To keep Claude from silently "improving" the spec:

1. Emit a **single structured-Markdown artifact** — one human-readable, hand-editable, authoritative representation. **No separate JSON block.** The closed-set signal comes from the *constraint language*, not from JSON syntax (the braces were never the load-bearing thing). One representation means a hand-edit before pasting can't drift against a second copy.
2. **Explicitly trigger the mechanism** (`ultracode` / "run this as a workflow") so Claude routes to the workflow runtime instead of doing the task inline.
3. State the spec as **closed constraints**: "use exactly these agents, models, and phases; do not add, remove, merge, or re-model any stage."
4. Leave only the JS control-flow *implementation* to Claude; the spec owns the *what*.
5. Ask Claude to **show the phase plan before running**, dovetailing with the built-in approval screen.
6. Resolve model **aliases → canonical full ids** on emit (the alias is a UI convenience; the artifact must carry the id most likely to route correctly).

Export is **one-way**, and the primary loop is **edit-in-GUI-then-re-export**. Hand-editing the emitted artifact is allowed, but the moment the user does, the GUI no longer reflects what ran — and that's fine; the model was never reconstructed from the artifact.

Validate with a **faithfulness fixture suite**: emit specs through the prompt path and diff the resulting Markdown phase plan against the spec. (Markdown is emitted deterministically from the model, so it snapshots/diffs as cleanly as JSON would.) **Whether Claude treats structured-Markdown as authoritatively as a fenced JSON payload is an empirical unknown — see `OpenQuestions.md`.** Fallback if it drifts: same content wrapped in one fenced block — still *one* representation, never two.

## Editing paradigm — form-primary

Editing surface is a **structured form / outline**, not a node canvas. Reasons: the content is text- and attribute-heavy (long prompts, model picks, caps) which canvases edit poorly; A+ has two semantically different edge types (topology "runs after" vs. capped "may delegate to") that are clearer as dropdowns than hand-drawn edges; realistic workflows are small (3–8 agents); and the headline *visibility* payoff is a **generated graph** derived from the model — always correct because it's derived, not drawn. The graph is a projection, deferred past the MVP.

## Pattern vocabulary

The spec is a **composition of named, nestable patterns** — a curated library, not arbitrary control flow (a form GUI can't expose Turing-complete flow without becoming a visual programming language). Patterns are **composable** (a phase whose stage is itself a fan-out) and the set **grows over time**.

Starting set:

- **Sequence / phase** — A, then B (results pass forward).
- **Fan-out (map)** — same agent over N inputs in parallel (concurrency cap ≤16).
- **Map-reduce** — fan-out, then a reducer synthesizes.
- **Adversarial review** — a producer's output is challenged by an independent critic before acceptance.
- **Multi-angle + vote** — draft from K angles, converge/vote (what `/deep-research` does).
- **Bounded iterate-until** — repeat a stage up to N times until a check passes.
- **A+ capped delegation** — a node may spawn a pinned, capped sub-agent at runtime.

When a workflow genuinely needs custom control flow the pattern library can't express, the escape hatch is the normal Claude-writes-a-workflow flow — the tool doesn't have to cover 100%.

## V1 node (agent) fields

| Field | Status | Notes |
|---|---|---|
| Name / role | first-class | editable `name` (display label); a separate stable opaque `id` is what refs point at, so renaming never invalidates refs mid-edit |
| **Model** | **enforced, headline** | **blended combobox** (Base UI): "inherit" pinned at top (default for a new agent), then the list from a **bundled static config** (`models.ts` — current Claude family + short aliases; swappable to runtime-fetch later), and typing an off-list string offers a **raw-id escape** with a soft "unverified" hint. Aliases resolve to canonical full ids on emit |
| Prompt | first-class | the agent's instructions |
| Caps | first-class | workflow-level concurrency (≤16) and total (≤1000); per-fanout `cap` (ceiling on parallel agents); per-grant cap N on A+ delegations (deferred) |
| Tools | **omitted in V1** | deferred to V2 pending verification that the runtime enforces per-agent narrowing |

## Draft spec schema (starting point — not final)

Decisions locked 2026-06-17 (design grill): **implicit positional data flow** (the tree *is* the data flow — no `inputsFrom`/`check` wiring in V1); **bare-string `AgentRef`** pointing at a **stable opaque `id`** with a **separate editable `name`**; fanout is **dynamic-N over prior output, bounded by `cap`** (cap is a ceiling, not a count).

```
WorkflowSpec {
  name: string
  caps: { concurrency: int<=16, total: int<=1000 }
  agents: Agent[]
  root: PatternNode            // composition tree (root is a sequence in V1)
}
Agent {
  id: string                   // stable opaque id (generated); never shown; refs point here
  name: string                 // editable display label / role; emitter serializes by name
  model: "inherit" | <modelId> // enforced; alias resolved to canonical id on emit
  prompt: string
}
AgentRef = string              // an Agent.id; dangling-ref check = id exists in agents[]
PatternNode =
  | { type: "sequence", steps: PatternNode[] }            // implicit forward-passing of results
  | { type: "fanout", agent: AgentRef, cap: int }         // maps over prior output, dynamic N, ≤ cap
  // --- deferred patterns (model supports them; V1 editor does not expose) ---
  | { type: "mapReduce", map: {agent, cap}, reduce: AgentRef }
  | { type: "adversarial", producer: AgentRef, critic: AgentRef }
  | { type: "multiAngle", agent: AgentRef, angles: int, vote: AgentRef }
  | { type: "iterateUntil", body: PatternNode, maxIter: int }
  | { type: "agent", agent: AgentRef, grants?: Grant[] }   // A+ leaf
Grant { agent: AgentRef, cap: int }   // capped delegation (deferred; reintroduces cycle risk)
```

Build this schema first — the prompt emitter, the future script emitter, and the graph are all serializers over it.

**V1 editor vs. model:** the model is the full recursive `PatternNode` tree above, but the **V1 editor exposes only a flat ordered phase list** where each phase is either a single-agent step or a fanout. Deeper nesting is a model capability the editor catches up to in V1.1 — not a schema limitation.

**Cycle detection is a no-op in V1:** a tree of `sequence`/`fanout` has no back-edges, so a cycle is structurally impossible. It becomes real only when `Grant` (A+ delegation) lands. Enforce the tree via the recursive schema; the only real graph check in V1 is the dangling `AgentRef`.

## Claude Code dynamic-workflow runtime — reference facts

Source: https://code.claude.com/docs/en/workflows (verified 2026-06).

- A dynamic workflow is a JS script a **runtime executes** in an isolated environment, separate from the conversation; intermediate results live in script variables (not Claude's context).
- Triggered by the `ultracode` keyword or natural-language "run as a workflow"; `/effort ultracode` makes Claude plan a workflow for every substantive task.
- The script is written to a file under `~/.claude/projects/`; you can **read, edit, and ask Claude to relaunch** from the edited version.
- Runs can be **saved as `/<name>` commands** in `.claude/workflows/` (project) or `~/.claude/workflows/` (personal); input passed via a global `args`.
- **Caps:** ≤16 concurrent agents, ≤1000 total per run.
- The **script itself** has no direct filesystem/shell access — only the agents it spawns do; the script coordinates.
- Agents **inherit the session tool allowlist** and run in `acceptEdits`.
- **Per-stage model routing is supported** ("every agent uses your session's model unless the script routes a stage to a different one").
- Approval screen shows planned phases + agent counts + "View raw script"; subagent permission prompts can still pause a run.
- Requires Claude Code **v2.1.154+**.
