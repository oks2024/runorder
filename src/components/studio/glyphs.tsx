import type { ReactNode } from 'react'
import type { PatternKey } from '@/lib/patterns'

/**
 * The topology glyphs shown on the pattern shelf — the original seven ported verbatim from
 * the mockup (`.pat svg`, lines 273-286), plus refine (draft⇄judge cycle), verify (items
 * through a gate, one dropped) and branches (independent parallel lanes) drawn in the same
 * idiom: 44×30 viewBox, filled = the phase's
 * driving agent, outlined = its output side, `currentColor` so they inherit `text-ink-dim`.
 * Kept as one map so `PatternCard`/`Shelf` can look a glyph up by kind.
 */
export const PATTERN_GLYPHS: Record<PatternKey, ReactNode> = {
  step: (
    <svg viewBox="0 0 44 30">
      <circle cx="10" cy="15" r="4" fill="currentColor" />
      <path d="M16 15h14" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="34" cy="15" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  fanout: (
    <svg viewBox="0 0 44 30">
      <circle cx="8" cy="15" r="4" fill="currentColor" />
      <path
        d="M12 15c8 0 8-9 16-9M12 15h16M12 15c8 0 8 9 16 9"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="32" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="32" cy="15" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="32" cy="24" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  branches: (
    // Three independent lanes, no crossing: distinct siblings running side by side.
    <svg viewBox="0 0 44 30">
      <circle cx="10" cy="6" r="3" fill="currentColor" />
      <circle cx="10" cy="15" r="3" fill="currentColor" />
      <circle cx="10" cy="24" r="3" fill="currentColor" />
      <path d="M14 6h14M14 15h14M14 24h14" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="32" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="32" cy="15" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="32" cy="24" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  loop: (
    <svg viewBox="0 0 44 30">
      <circle cx="22" cy="15" r="4" fill="currentColor" />
      <path d="M22 6a9 9 0 1 1-9 9" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M10 10l3 5 4-3" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  ),
  mapReduce: (
    <svg viewBox="0 0 44 30">
      <circle cx="10" cy="6" r="3" fill="currentColor" />
      <circle cx="10" cy="15" r="3" fill="currentColor" />
      <circle cx="10" cy="24" r="3" fill="currentColor" />
      <path
        d="M14 6c8 0 8 9 16 9M14 15h16M14 24c8 0 8-9 16-9"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="34" cy="15" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  adversarial: (
    <svg viewBox="0 0 44 30">
      <circle cx="12" cy="15" r="4" fill="currentColor" />
      <circle cx="32" cy="15" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M17 12h10M27 18H17" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M25 10l3 2-3 2M19 20l-3-2 3-2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  ),
  refine: (
    <svg viewBox="0 0 44 30">
      <circle cx="12" cy="15" r="4" fill="currentColor" />
      <circle cx="32" cy="15" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 10c5-5 10-5 14 1M29 20c-5 5-10 5-14-1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M27 8l3 3-4 1M17 22l-3-3 4-1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  ),
  verify: (
    <svg viewBox="0 0 44 30">
      <circle cx="8" cy="6" r="3" fill="currentColor" />
      <circle cx="8" cy="15" r="3" fill="currentColor" />
      <circle cx="8" cy="24" r="3" fill="currentColor" />
      <path d="M12 6h10M12 15h10M12 24h10" stroke="currentColor" strokeWidth="1.2" />
      <path d="M24 2v26" stroke="currentColor" strokeWidth="1.5" />
      <path d="M26 6h7M26 24h7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="37" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="37" cy="24" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  multiAngle: (
    <svg viewBox="0 0 44 30">
      <circle cx="8" cy="6" r="3" fill="currentColor" />
      <circle cx="8" cy="15" r="3" fill="currentColor" />
      <circle cx="8" cy="24" r="3" fill="currentColor" />
      <path d="M12 6h14M12 15h14M12 24h14" stroke="currentColor" strokeWidth="1.2" />
      <path d="M30 15l6-6v12z" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  delegate: (
    <svg viewBox="0 0 44 30">
      <circle cx="14" cy="10" r="5" fill="currentColor" />
      <circle cx="28" cy="22" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="36" cy="22" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M17 14l8 6M19 12l14 8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
}
