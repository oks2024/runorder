const swatches = [
  { label: 'Opus', color: 'var(--color-opus)', glow: true },
  { label: 'Sonnet', color: 'var(--color-sonnet)', glow: true },
  { label: 'Haiku', color: 'var(--color-haiku)', glow: true },
  { label: 'inherit', color: 'var(--color-led-inherit)', glow: false },
  { label: 'raw-id', color: 'var(--color-rawid)', glow: true },
]

export function FooterBar() {
  return (
    <footer className="flex flex-wrap items-center gap-[18px] border-t border-line bg-panel px-[18px] py-2 font-mono text-[11px] text-ink-faint">
      <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-enforced/40 px-1.5 py-px text-enforced">
        <span className="size-[7px] rounded-full bg-enforced shadow-[0_0_6px_var(--color-enforced)]" />
        ENFORCED — model pin (runtime-routed)
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-intended/40 px-1.5 py-px text-intended">
        <span className="size-[7px] rounded-full bg-intended shadow-[0_0_6px_var(--color-intended)]" />
        INTENDED — counts &amp; caps (not guaranteed)
      </span>
      <span className="flex-1" />
      {swatches.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ background: s.color, boxShadow: s.glow ? `0 0 6px ${s.color}` : undefined }}
          />
          {s.label}
        </span>
      ))}
    </footer>
  )
}
