import type { ElementType, ReactNode } from 'react'
import { useProv, litStyle } from './useProv'
import { cn } from '@/lib/utils'

/**
 * Wraps a worksheet field with its provenance key(s) (`src/lib/prov.ts`) — the same join the
 * emitted script lines carry. Always renders the wrapping element (so callers can hand it the
 * field's *base* styling via `className`, not just an on-hover extra); when `keys` is falsy
 * (an id-less node — shouldn't happen in practice, but never crash the sentence over it) it
 * still renders structurally, just without the `data-prov`/hover wiring.
 *
 * `as` picks the element so callers can wrap an inline token (`span`, the default) or a whole
 * sentence/paragraph (`p`) — matching what the emitter tagged (guardrail #5: never claim
 * provenance a field didn't actually produce).
 */
export function ProvSpan({
  keys,
  as: As = 'span',
  className,
  children,
}: {
  keys: string | string[] | undefined
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  const { lit, hoverProps } = useProv(keys)
  const attr = Array.isArray(keys) ? (keys.length ? keys.join(' ') : undefined) : keys

  return (
    <As
      data-prov={attr}
      {...(attr ? hoverProps : {})}
      className={cn(lit && 'lit rounded-md', className)}
      style={litStyle(lit)}
    >
      {children}
    </As>
  )
}
