import type { CSSProperties } from 'react'

/**
 * A bounded number, edited in place inside a worksheet sentence or the lede (mockup
 * `.num-token`): a controlled numeric `<input>` in intended-amber. Commits on change; the
 * store clamps to the field's bounds, so the re-rendered value reflects the clamp.
 */
export function NumToken({
  value,
  min,
  max,
  label,
  onCommit,
}: {
  value: number
  min: number
  max: number
  /** Accessible name (e.g. "fan-out cap"). */
  label: string
  onCommit: (n: number) => void
}) {
  // content-box: `ch` sizes the digits themselves; padding/border stay additive (border-box
  // would subtract them from the width and clip single digits).
  const ch = Math.max(String(value).length, 1) + 0.5
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      onChange={(e) => onCommit(e.target.valueAsNumber)}
      className="inline-block rounded-[5px] border border-rule bg-paper-2 px-1.5 text-center font-mono text-[14px] font-semibold text-intended [appearance:textfield] outline-none focus-visible:outline-2 focus-visible:outline-focus"
      style={{ width: `${ch}ch`, boxSizing: 'content-box' } as CSSProperties}
    />
  )
}
