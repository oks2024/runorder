/**
 * One source of truth for the pattern vocabulary shown to the user: badge labels, tooltip
 * copy, and (Studio) shelf one-liners. Used by the CompositionPane add-buttons and the
 * PhaseRow badges (mockup-7) as well as the Studio pattern shelf so all surfaces describe a
 * pattern identically. Copy states what the *emitted script does* — including the injected
 * plumbing (reads splice, forced schemas) — not aspirations. Lives outside `components/` so
 * non-component code (the store, `nodeRoles.ts`, etc.) can import it without reaching into
 * the UI layer.
 */

export type PatternKey =
  | 'step'
  | 'fanout'
  | 'branches'
  | 'loop'
  | 'mapReduce'
  | 'adversarial'
  | 'refine'
  | 'verify'
  | 'multiAngle'
  | 'delegate'

export interface PatternInfo {
  /** Badge text (with glyph) shown on the phase row. */
  badge: string
  /** Add-button text in the composition pane. */
  button: string
  /** Tooltip copy shared by badge + button. */
  tip: string
  /** Studio pattern-shelf one-liner: when to reach for this pattern. */
  use: string
}

/** Shelf card order (mirrors the mockup's playbook order top-to-bottom). */
export const PATTERN_ORDER: PatternKey[] = [
  'step',
  'fanout',
  'branches',
  'loop',
  'mapReduce',
  'adversarial',
  'refine',
  'verify',
  'multiAngle',
  'delegate',
]

/** Shelf display name (mockup `.pat .nm`) — distinct from the terser `.pnum` kind label. */
export const PATTERN_NAME: Record<PatternKey, string> = {
  step: 'step',
  fanout: 'fan-out',
  branches: 'branches',
  loop: 'loop',
  mapReduce: 'map-reduce',
  adversarial: 'adversarial',
  refine: 'refine',
  verify: 'verify',
  multiAngle: 'multi-angle',
  delegate: 'A+ delegation',
}

/** `dataTransfer` MIME type carrying the dragged pattern kind from the shelf to a drop zone. */
export const PATTERN_DND_MIME = 'application/x-runorder-pattern'

export const PATTERN_INFO: Record<PatternKey, PatternInfo> = {
  step: {
    badge: '● Step',
    button: '+ Step',
    tip: 'One agent runs once. It receives its prompt plus the memories this phase reads; its output becomes this phase’s memory.',
    use: 'one agent, once',
  },
  fanout: {
    badge: '⋔ Fan-out',
    button: '+ Fan-out',
    tip: 'Dynamic-N parallel copies of one agent — one per item from the previous phase, count capped in-script. The producing phase is schema-forced to { context, items }, so N is exact. Each worker gets the reads plus its one assigned item; the phase’s memory is the array of worker outputs.',
    use: 'one worker per item, capped',
  },
  branches: {
    badge: '∥ Branches',
    button: '+ Branches',
    tip: 'Several DIFFERENT agents run once each, in parallel — one phase, N distinct tasks on the same reads (e.g. cast / world / villains after a setting). Outputs are kept in branch order; a later phase that reads this memory gets each branch as its own labeled [name] block, and a following fan-out maps over exactly those N outputs.',
    use: 'different tasks, side by side',
  },
  loop: {
    badge: '↻ Loop',
    button: '+ Loop',
    tip: 'One agent repeated up to max iterations. Each pass it must report { done, output } (runtime-enforced schema); the loop carries output forward as state and stops early when done. Use for iterative refinement toward a condition.',
    use: 'repeat until done, bounded',
  },
  mapReduce: {
    badge: '⇉ Map-reduce',
    button: '+ Map-reduce',
    tip: 'Two stages in one phase: a map agent runs in parallel over the previous phase’s items (capped), then a reduce agent merges all map outputs into one result — which becomes the phase’s memory. Fan-out + synthesis without a separate step.',
    use: 'transform each, then merge',
  },
  adversarial: {
    badge: '⚔ Adversarial',
    button: '+ Adversarial',
    tip: 'A producer drafts, then a critic attacks the draft (both get the phase’s reads; the critic also gets the draft). The phase’s memory is { draft, critique } — downstream steps see both sides. Use to catch plausible-but-wrong output.',
    use: 'one makes, one breaks',
  },
  refine: {
    badge: '⟳ Refine',
    button: '+ Refine',
    tip: 'A producer drafts, then a judge must report { approved, critique } (runtime-enforced schema). While not approved, the critique is handed back and the producer revises — up to max revisions, stopping early on approval. The phase’s memory is the last draft. Use when the critique should actually get fixed, not just recorded.',
    use: 'draft, judge, revise until approved',
  },
  verify: {
    badge: '✓ Verify',
    button: '+ Verify',
    tip: 'For each item of the previous phase (capped), N independent skeptics each try to REFUTE it — every vote is runtime-enforced to { refuted, reason }. The script then counts votes and keeps only items whose refutals are a strict minority; the phase’s memory is the surviving subset. Use to gate findings before acting on them.',
    use: 'a refuter jury per item; majority gate',
  },
  multiAngle: {
    badge: '✳ Multi-angle',
    button: '+ Multi-angle',
    tip: 'The same agent runs N times in parallel on the same input (independent takes), then a vote agent compares the candidates and picks or synthesizes the best — that verdict is the phase’s memory. Use when one attempt is too hit-or-miss.',
    use: 'N takes, then a vote',
  },
  delegate: {
    badge: '⇲ Delegate',
    button: '+ Delegate',
    tip: 'A+ delegation: a lead agent decides the sub-tasks at run time — it is schema-forced to { context, items } — then a capped fan-out of the granted agent works those items, each grantee receiving the lead’s context. The phase’s memory is the grantees’ outputs.',
    use: 'a lead that spawns helpers',
  },
}

/** Tooltip copy for the secondary-agent role selectors on composite phase rows. */
export const ROLE_TIPS: Record<'reduce' | 'critic' | 'vote' | 'delegate' | 'judge', string> = {
  reduce: 'The agent that merges all parallel map outputs into this phase’s single result.',
  critic: 'The agent that critiques the producer’s draft; the phase outputs { draft, critique }.',
  vote: 'The agent that compares the parallel takes and picks or synthesizes the best one.',
  delegate: 'The agent the lead delegates to — one instance per sub-task, bounded by the cap.',
  judge: 'The agent that approves or rejects each draft; its critique drives the next revision.',
}
