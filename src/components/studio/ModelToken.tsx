import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { INHERIT, MODELS } from '@/lib/models'
import { hueVar, shortModel } from './hue'

interface Opt {
  value: string
  label: string
  hint: string
}

const KNOWN: Opt[] = [
  { value: INHERIT, label: 'inherit', hint: 'use session model' },
  ...MODELS.map((m) => ({ value: m.id, label: m.id, hint: m.alias })),
]

/** Trigger label: short id, or "session model" when nothing is pinned. */
function triggerLabel(value: string): string {
  return value === INHERIT ? 'session model' : shortModel(value)
}

/**
 * The model pill, edited in place inside a rundown sentence (mockup `.model-token`): a
 * `--phue`-tinted trigger (its own model's family hue; gray for `inherit`) opening the same
 * searchable Claude-family popup as mockup-7 — `inherit` + bundled models + a raw-id escape
 * ("Use raw id …, unverified"). Commits the raw string; alias→canonical resolution is the
 * emitter's job. The enforced mark beside the pill is the caller's (only when not inherit).
 */
export function ModelToken({
  value,
  onChange,
}: {
  value: string
  onChange: (model: string) => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const hue = hueVar(value)

  const filtered = useMemo(
    () =>
      q
        ? KNOWN.filter((o) => `${o.value} ${o.label} ${o.hint}`.toLowerCase().includes(q))
        : KNOWN,
    [q],
  )
  // raw-id escape: a non-empty query matching no known option and not the current value.
  const showRawId = q.length > 0 && filtered.length === 0 && query.trim() !== value

  return (
    <Combobox.Root
      value={value}
      onValueChange={(v) => {
        if (typeof v === 'string') onChange(v)
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (!open) setQuery('')
      }}
      filter={null}
    >
      <Combobox.Trigger
        aria-label="Model"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-px align-baseline font-mono text-[12.5px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus"
        style={
          {
            '--phue': hue,
            color: 'var(--phue)',
            background: 'color-mix(in oklch, var(--phue) 7%, var(--color-paper))',
            border: '1px solid color-mix(in oklch, var(--phue) 30%, var(--color-rule))',
          } as CSSProperties
        }
      >
        <span
          className="inline-block flex-none rounded-full"
          style={{ width: 7, height: 7, background: 'var(--phue)' }}
        />
        <span>{triggerLabel(value)}</span>
        <span aria-hidden>▾</span>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} className="z-30 w-[max(var(--anchor-width),220px)]">
          <Combobox.Popup className="rounded-[10px] border border-rule bg-paper-2 p-2 shadow-[0_14px_32px_oklch(0_0_0/0.14)]">
            <Combobox.Input
              placeholder="search or type a raw model id…"
              className="mb-1.5 w-full rounded-md border border-rule bg-paper px-2 py-1.5 font-mono text-xs text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
            />
            <Combobox.List className="flex flex-col gap-0.5">
              {filtered.map((o) => (
                <Combobox.Item
                  key={o.value}
                  value={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 font-mono text-xs text-ink data-highlighted:border-rule-soft data-highlighted:bg-paper-3"
                >
                  <span
                    className="size-2 flex-none rounded-full"
                    style={{ background: hueVar(o.value) }}
                  />
                  {o.label}
                  <span className="ml-auto text-[11px] text-ink-faint">{o.hint}</span>
                </Combobox.Item>
              ))}
              {showRawId && (
                <Combobox.Item
                  value={query.trim()}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 font-mono text-xs text-rawid data-highlighted:bg-paper-3"
                  style={{
                    borderColor: 'color-mix(in oklch, var(--color-rawid) 40%, var(--color-rule))',
                  }}
                >
                  <span className="size-2 flex-none rounded-full bg-rawid" />
                  Use raw id "{query.trim()}"
                  <span className="ml-auto text-[10px] text-intended">⚠ unverified</span>
                </Combobox.Item>
              )}
            </Combobox.List>
            <div className="mt-1.5 border-t border-rule-soft px-1 pt-1.5 font-mono text-[10px] text-ink-faint">
              Aliases resolve to canonical ids on emit. Unknown ids are accepted as a raw-id
              escape (unverified).
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
