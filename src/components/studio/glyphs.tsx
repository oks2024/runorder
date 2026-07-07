import type { ReactNode } from 'react'
import type { PatternKey } from '@/lib/patterns'

/**
 * The topology glyphs shown on the pattern shelf, drawn under one symbol grammar so the same
 * mark always means the same thing across every card:
 *
 *   ● filled circle  = one agent run in this phase (N parallel runs = N filled circles). EVERY
 *                      agent is filled — critic, judge, reducer, vote, jury skeptic, lead, helper.
 *   ▫ small open square = one item crossing the phase boundary (an item handed in from the
 *                      previous phase, or a surviving output item).
 *
 * Input squares are drawn ONLY where the pattern consumes the previous phase's items
 * (fan-out, map-reduce, verify); output squares ONLY where what-leaves is the point
 * (verify's survivors). Everything shares the same idiom: 44×30 viewBox, `currentColor` so
 * glyphs inherit `text-ink-dim`, stroke weights 1.2–1.5, lane centers y = 6 / 15 / 24. Kept
 * as one map so `PatternCard`/`Shelf` can look a glyph up by kind.
 */

/** One item crossing the phase boundary: a ~3×3 open square centered on (cx, cy). */
const item = (cx: number, cy: number): ReactNode => (
  <rect
    x={cx - 1.5}
    y={cy - 1.5}
    width="3"
    height="3"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
  />
)

// eslint-disable-next-line react-refresh/only-export-components -- glyph map + GlyphLegend live together by design (one grammar, one file)
export const PATTERN_GLYPHS: Record<PatternKey, ReactNode> = {
  step: (
    <svg viewBox="0 0 44 30">
      <circle cx="10" cy="15" r="4" fill="currentColor" />
      <path d="M16 15h15" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M31 12l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  ),
  fanout: (
    <svg viewBox="0 0 44 30">
      {item(8, 6)}
      {item(8, 15)}
      {item(8, 24)}
      <path d="M10.5 6H21M10.5 15H21M10.5 24H21" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="24" cy="6" r="3" fill="currentColor" />
      <circle cx="24" cy="15" r="3" fill="currentColor" />
      <circle cx="24" cy="24" r="3" fill="currentColor" />
    </svg>
  ),
  branches: (
    // Three independent lanes, no squares: distinct siblings running once each, side by side.
    <svg viewBox="0 0 44 30">
      <circle cx="12" cy="6" r="3" fill="currentColor" />
      <circle cx="12" cy="15" r="3" fill="currentColor" />
      <circle cx="12" cy="24" r="3" fill="currentColor" />
      <path d="M16 6h13M16 15h13M16 24h13" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path
        d="M29 3l3 3-3 3M29 12l3 3-3 3M29 21l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
      />
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
      {item(5, 6)}
      {item(5, 15)}
      {item(5, 24)}
      <path d="M6.5 6H9M6.5 15H9M6.5 24H9" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="12" cy="6" r="2.8" fill="currentColor" />
      <circle cx="12" cy="15" r="2.8" fill="currentColor" />
      <circle cx="12" cy="24" r="2.8" fill="currentColor" />
      <path
        d="M15 6c8 0 8 9 16 9M15 15h16M15 24c8 0 8-9 16-9"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="34" cy="15" r="4" fill="currentColor" />
    </svg>
  ),
  adversarial: (
    <svg viewBox="0 0 44 30">
      <circle cx="12" cy="15" r="4" fill="currentColor" />
      <circle cx="32" cy="15" r="4" fill="currentColor" />
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
      <circle cx="32" cy="15" r="4" fill="currentColor" />
      <path d="M15 10c5-5 10-5 14 1M29 20c-5 5-10 5-14-1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M27 8l3 3-4 1M17 22l-3-3 4-1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  ),
  verify: (
    <svg viewBox="0 0 44 30">
      {item(5, 6)}
      {item(5, 15)}
      {item(5, 24)}
      <path d="M6.5 6H9M6.5 15H9M6.5 24H9" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="13" cy="6" r="2.8" fill="currentColor" />
      <circle cx="13" cy="15" r="2.8" fill="currentColor" />
      <circle cx="13" cy="24" r="2.8" fill="currentColor" />
      <path d="M16 6h6M16 15h6M16 24h6" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M24 2v26" stroke="currentColor" strokeWidth="1.5" />
      <path d="M26 6h7M26 24h7" stroke="currentColor" strokeWidth="1.2" fill="none" />
      {item(37, 6)}
      {item(37, 24)}
    </svg>
  ),
  multiAngle: (
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
      <circle cx="34" cy="15" r="4" fill="currentColor" />
    </svg>
  ),
  delegate: (
    <svg viewBox="0 0 44 30">
      <circle cx="14" cy="10" r="5" fill="currentColor" />
      <circle cx="28" cy="22" r="3" fill="currentColor" />
      <circle cx="36" cy="22" r="3" fill="currentColor" />
      <path d="M17 14l8 6M19 12l14 8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
}

/**
 * A one-line key for the glyph grammar, shown above the shelf/sheet card list so the two marks
 * (filled dot = agent run, open square = item crossing the phase boundary) are never guessed at.
 * Style matches the muted shelf intro copy; callers pass margin/padding via `className`.
 */
export function GlyphLegend({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] leading-[1.45] text-ink-faint ${className}`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="flex-none">
        <circle cx="5" cy="5" r="3" fill="currentColor" />
      </svg>
      <span>agent run</span>
      <span aria-hidden>·</span>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="flex-none">
        <rect x="2.4" y="2.4" width="5.2" height="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span>item handed between phases</span>
    </div>
  )
}
