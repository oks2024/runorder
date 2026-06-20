import { useMemo, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { INHERIT, MODELS, modelFamily } from '@/lib/models'
import { hueVar } from './hue'

/** Human label for a model's family classification (trigger badge). */
function familyLabel(model: string): string {
  const f = modelFamily(model)
  if (f === 'inherit') return 'inherit'
  if (f === 'rawid') return 'raw-id'
  return f[0].toUpperCase() + f.slice(1)
}

interface Opt {
  value: string
  label: string
  hint: string
}

const KNOWN: Opt[] = [
  { value: INHERIT, label: 'inherit', hint: 'use session model' },
  ...MODELS.map((m) => ({ value: m.id, label: m.id, hint: m.alias })),
]

/**
 * Blended model picker (Architecture V1 node fields): a trigger showing the current model
 * with its family LED, opening a searchable popup of `inherit` + the bundled Claude family,
 * plus a **raw-id escape** — typing an off-list id offers it with a soft "unverified" hint.
 * Commits the raw string (alias→canonical resolution happens at emit time, not here).
 */
export function ModelCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (model: string) => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const filtered = useMemo(
    () => (q ? KNOWN.filter((o) => `${o.value} ${o.label} ${o.hint}`.toLowerCase().includes(q)) : KNOWN),
    [q],
  )
  // raw-id escape: a non-empty query that matches no known option and isn't the current value.
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
        className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left font-mono text-[12.5px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
        style={{
          borderColor: `color-mix(in oklch, ${hueVar(value)} 45%, var(--color-line))`,
          background: `color-mix(in oklch, ${hueVar(value)} 16%, var(--color-well))`,
        }}
      >
        <span
          className="size-2 flex-none rounded-full"
          style={{ background: hueVar(value), boxShadow: `0 0 7px ${hueVar(value)}` }}
        />
        <span className="truncate">{value}</span>
        <span className="ml-auto border-l border-line pl-2 text-[9.5px] tracking-[0.1em] text-ink-faint uppercase">
          {familyLabel(value)}
        </span>
        <span className="text-ink-faint" aria-hidden>
          ▾
        </span>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} className="z-30 w-[var(--anchor-width)]">
          <Combobox.Popup className="rounded-[10px] border border-line bg-panel2 p-2 shadow-[0_14px_32px_oklch(0_0_0/0.5)]">
            <Combobox.Input
              placeholder="search or type a raw model id…"
              className="mb-1.5 w-full rounded-md border border-line bg-well px-2 py-1.5 font-mono text-xs text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
            />
            <Combobox.List className="flex flex-col gap-0.5">
              {filtered.map((o) => (
                <Combobox.Item
                  key={o.value}
                  value={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 font-mono text-xs text-ink data-highlighted:border-line-soft data-highlighted:bg-well"
                >
                  <span
                    className="size-2 flex-none rounded-full"
                    style={{
                      background: hueVar(o.value),
                      boxShadow: o.value === INHERIT ? undefined : `0 0 6px ${hueVar(o.value)}`,
                    }}
                  />
                  {o.label}
                  <span className="ml-auto text-[11px] text-ink-faint">{o.hint}</span>
                </Combobox.Item>
              ))}
              {showRawId && (
                <Combobox.Item
                  value={query.trim()}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 font-mono text-xs text-rawid data-highlighted:bg-well"
                  style={{ borderColor: 'color-mix(in oklch, var(--color-rawid) 40%, var(--color-line))' }}
                >
                  <span
                    className="size-2 flex-none rounded-full bg-rawid"
                    style={{ boxShadow: '0 0 6px var(--color-rawid)' }}
                  />
                  Use raw id "{query.trim()}"
                  <span className="ml-auto text-[10px] text-intended">⚠ unverified</span>
                </Combobox.Item>
              )}
            </Combobox.List>
            <div className="mt-1.5 border-t border-line-soft px-1 pt-1.5 font-mono text-[10px] text-ink-faint">
              Aliases resolve to canonical ids on emit. Unknown ids are accepted as a raw-id escape
              (unverified).
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
