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

1. Embed a **structured spec block** (JSON from the model), not prose.
2. **Explicitly trigger the mechanism** (`ultracode` / "run this as a workflow") so Claude routes to the workflow runtime instead of doing the task inline.
3. State the spec as **closed constraints**: "use exactly these agents, models, counts; do not add, remove, merge, or re-model any stage."
4. Leave only the JS control-flow *implementation* to Claude; the spec owns the *what*.
5. Ask Claude to **show the phase plan before running**, dovetailing with the built-in approval screen.

Validate with a **faithfulness fixture suite**: run specs through the prompt path and diff the resulting phase plan against the spec.

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
| Name / role | first-class | identifier used in the graph and by other nodes |
| **Model** | **enforced, headline** | dropdown from an **updatable config file** (not a hardcoded enum) + free-text raw-id escape + an explicit "inherit session model" option (the runtime default) |
| Prompt | first-class | the agent's instructions |
| Caps | first-class | workflow-level concurrency (≤16) and total (≤1000); per-grant cap N on A+ delegations |
| Tools | **omitted in V1** | deferred to V2 pending verification that the runtime enforces per-agent narrowing |

## Draft spec schema (starting point — not final)

```
WorkflowSpec {
  name: string
  caps: { concurrency: int<=16, total: int<=1000 }
  agents: Agent[]
  root: PatternNode            // composition tree
}
Agent {
  id: string                   // name/role, unique
  model: "inherit" | <modelId> // enforced
  prompt: string
}
PatternNode =
  | { type: "sequence", steps: PatternNode[] }
  | { type: "fanout", agent: AgentRef, inputsFrom: ..., cap: int }
  | { type: "mapReduce", map: {agent, cap}, reduce: AgentRef }
  | { type: "adversarial", producer: AgentRef, critic: AgentRef }
  | { type: "multiAngle", agent: AgentRef, angles: int, vote: AgentRef }
  | { type: "iterateUntil", body: PatternNode, maxIter: int, check: ... }
  | { type: "agent", agent: AgentRef, grants?: Grant[] }   // A+ leaf
Grant { agent: AgentRef, cap: int }   // capped delegation
```

Build this schema first — the prompt emitter, the future script emitter, and the graph are all serializers over it.

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
