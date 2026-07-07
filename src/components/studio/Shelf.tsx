import { PATTERN_ORDER } from '@/lib/patterns'
import { PatternCard } from './PatternCard'
import { GlyphLegend } from './glyphs'

/**
 * The pattern repertoire (mockup `.shelf`): a fixed-width left sidebar listing the topologies
 * as draggable cards, each carrying its own honest proof chip. Hidden below ~980px (mockup
 * `@media (max-width: 980px) { .shelf { display: none } }`) — a narrow viewport just loses
 * the shelf; each card's click-to-append fallback only helps once the shelf itself is visible.
 */
export function Shelf() {
  return (
    <aside
      aria-label="Pattern repertoire"
      className="hidden w-[236px] flex-none overflow-y-auto border-r border-rule-soft bg-paper-2 px-3.5 py-5 min-[980px]:block"
    >
      <div className="mx-1 mb-1 font-mono text-[9.5px] tracking-[0.16em] text-ink-faint uppercase">
        Repertoire
      </div>
      <p className="mx-1 mb-2 text-[11px] leading-[1.45] text-ink-faint">
        {PATTERN_ORDER.length} shapes, each marked with its proof status. Drag one into the
        rundown — its handoffs arrive pre-wired.
      </p>
      <GlyphLegend className="mx-1 mb-3.5" />
      {PATTERN_ORDER.map((kind) => (
        <PatternCard key={kind} kind={kind} />
      ))}
    </aside>
  )
}
