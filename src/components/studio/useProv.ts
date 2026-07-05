import type { CSSProperties } from 'react'
import { useUiStore } from '@/store/uiStore'

/** Normalize a prov-key prop (single key, array, or absent) to a plain array. */
function keysArray(keys: string | string[] | undefined): string[] {
  if (!keys) return []
  return Array.isArray(keys) ? keys : [keys]
}

/**
 * Two-way provenance hover, shared by the rundown side (fields) and the prompt-book side
 * (script lines) — the SAME hook, so "hovering either side lights both" is one code path,
 * not two independently-maintained ones.
 *
 * `lit` is true while `uiStore.provHover` matches ANY of this element's keys (a composite
 * script line honestly lights on either of its tagged fields — see the scriptEmitter's `tag`
 * helper, which puts several keys on one line when a line genuinely derives from several
 * fields). `hoverProps` sets `provHover` to this element's FIRST key on enter and clears it on
 * leave; for a multi-key script line that means hovering it lights whichever single rundown
 * field is listed first (honest, not exhaustive — see the M4 report for why that's acceptable).
 *
 * Subscribes to the DERIVED boolean, not the raw `provHover` string — Zustand's default
 * `Object.is` equality on the selector's return value means a leaf only re-renders when its
 * own lit state actually flips, not on every hover change elsewhere on the page.
 */
export function useProv(keys: string | string[] | undefined): {
  lit: boolean
  hoverProps: { onMouseEnter: () => void; onMouseLeave: () => void }
} {
  const arr = keysArray(keys)
  const lit = useUiStore((s) => arr.length > 0 && s.provHover !== null && arr.includes(s.provHover))
  const setProvHover = useUiStore((s) => s.setProvHover)
  const first = arr[0]

  return {
    lit,
    hoverProps: {
      onMouseEnter: () => {
        if (first) setProvHover(first)
      },
      onMouseLeave: () => setProvHover(null),
    },
  }
}

/**
 * The rundown-side lit highlight (mockup `[data-prov].lit`): a rounded tint using the
 * nearest `--phue` custom property in scope. A phase's hue cascades down to every descendant
 * via ordinary CSS inheritance (`PhaseSection` sets `--phue` once on the section element), so
 * fields inside a phase pick it up for free; fields with no phase in scope (the masthead name,
 * the lede caps sentence) fall back to focus-blue.
 */
export function litStyle(lit: boolean): CSSProperties | undefined {
  if (!lit) return undefined
  return {
    background: 'color-mix(in oklch, var(--phue, var(--color-focus)) 9%, var(--color-paper))',
    boxShadow: '0 0 0 3px color-mix(in oklch, var(--phue, var(--color-focus)) 9%, var(--color-paper))',
  }
}
