/**
 * The tiny "enforced" honesty mark. Rendered ONLY where the emitted script literally
 * enforces the claim — next to a pinned model (`model !== inherit`), and next to the
 * literal cap/iters/angles/grant-cap numbers. Never next to an inherit model (that is the
 * session default — nothing is pinned) and never as a bare aspiration (guardrail #5).
 */
export function EnfMark() {
  return (
    <span
      className="ml-1 inline-block rounded-[4px] px-1.5 align-[2px] font-mono text-[8.5px] font-semibold tracking-[0.1em] text-enforced uppercase"
      style={{ border: '1px solid color-mix(in oklch, var(--color-enforced) 35%, var(--color-rule))' }}
      title="Enforced: the emitted script executes this literally."
    >
      enforced
    </span>
  )
}
