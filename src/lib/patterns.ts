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
  | 'loop'
  | 'mapReduce'
  | 'adversarial'
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
export const ROLE_TIPS: Record<'reduce' | 'critic' | 'vote' | 'delegate', string> = {
  reduce: 'The agent that merges all parallel map outputs into this phase’s single result.',
  critic: 'The agent that critiques the producer’s draft; the phase outputs { draft, critique }.',
  vote: 'The agent that compares the parallel takes and picks or synthesizes the best one.',
  delegate: 'The agent the lead delegates to — one instance per sub-task, bounded by the cap.',
}
