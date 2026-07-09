# Example workflows to ship / share

> Candidate example specs for Runorder. Each is described as a **topology** (patterns
> + per-agent model routing) so it can be built later as a seed-style `WorkflowSpec`.
> Ground rule for a *shippable* example: it must reveal something a Claude-authored
> workflow hides — a deliberate **model mix**, a **capped/visible fan-out N**, or a
> **real loop stop condition**. A "3 steps, all Opus" example teaches nothing.

## Curation criteria (why an example is worth sharing)
- **Visible model mix** — cheap Haiku for wide reads, Opus only where judgment is needed.
- **Predictable fan-out** — a capped N the user can see before running.
- **Real stop condition** — loops show `iterateUntil` / bounded iteration, not open-ended.
- **Run-proven patterns first** — per guardrails, `refine` / `verify` / `branches` are not
  yet run-proven; ship those examples only after run-proof, or mark them clearly.

---

## Coding / codebase (core audience)

### 1. Deep code review (Opus find → Opus deep-dive fan-out → Sonnet consolidate)  ★ flagship
The user-requested flow. Data-dependent deep-dive count.
- **step** — Opus reviewer over the diff; schema-forced `{ context, items }`; `items` =
  findings that are complicated / need more research.
- **fan-out** — one **Opus** deep-dive agent per flagged item (capped N; empty list → zero agents).
- **reduce** — **Sonnet** consolidates review context + all deep-dive outputs into one report.
- *Shows:* data-driven fan-out (0..N), three-tier reasoning, cheap consolidation.

### 2. PR / diff reviewer (multi-lens)
Mirrors the `code-review-loop` seed.
- **branches** — distinct lenses (correctness, security, perf, tests), each **Sonnet**, same reads.
- **verify** — Haiku refuter jury over the findings; in-script majority gate.
- **reduce** — **Opus** synthesis into a ranked report.
- *Shows:* heterogeneous parallelism + adversarial verify + model mix. *(uses not-yet-run-proven patterns)*

### 3. Codebase onboarding map
- **fan-out** — one **Haiku** reader per subsystem/directory.
- **map-reduce** — **Opus** architecture summary.
- *Shows:* cheap wide read, expensive synthesis.

### 4. Test-coverage hunter
- **fan-out** over changed files → per-file "what's untested" (**Sonnet**).
- **reduce** — prioritized gap list.

### 5. Bug-hunt loop
- **loop** — find → until dry (bounded).
- **adversarial** — verify each candidate.
- *Shows:* bounded iteration + explicit stop condition.

### 6. Migration / codemod sweep
- **fan-out** over call-sites (**worktree isolation**), each transforms + self-checks.
- *Shows:* one agent per item, capped N, isolated parallel mutation.

---

## Research / writing

### 7. Deep research report
- **multi-angle** — distinct search strategies in parallel.
- dedup → **verify** claims → cited **Opus** synthesis.
- *Shows:* legible routing; mirrors the deep-research pattern. *(uses not-yet-run-proven patterns)*

### 8. Draft-and-refine
- **refine** — draft → judge `{approved, critique}` → revise (bounded, early-break).
- *Shows:* simple, universal, early-break on approval. *(not-yet-run-proven)*

### 9. Multi-angle decision brief
- **multi-angle** — MVP-first / risk-first / user-first takes → vote → synthesize.
- *Shows:* strong non-coding showcase.

---

## Ops / analysis

### 10. Log / incident triage
- **fan-out** over log slices (**Haiku**) → cluster → **Opus** root-cause writeup.

### 11. Competitive / doc comparison
- **branches** — one agent per competitor/source → comparison table. *(not-yet-run-proven)*

---

## Open scoping decisions (before building the shipping set)
1. **Coverage vs. curation** — ~10 pattern-isolating examples (teaching gallery, overlaps the
   shelf cards) *or* ~4–5 realistic composites like the seed. Leaning: small composite set + seed.
2. **Run-proven only?** — ship examples built from run-proven patterns first; mark or defer the rest.
