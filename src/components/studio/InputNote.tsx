import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflowStore'
import { PROV_INPUT } from '@/lib/prov'
import { ProvSpan } from './ProvSpan'

/**
 * The launch-input declaration, sitting between the caps lede and phase 1 (mockup band). A
 * workflow may declare one input — what the user passes as the runtime `args` global — which
 * the emitters splice into the FIRST phase's prompt as a labeled `[label]` block. When unset,
 * a quiet "+ add launch input" affordance opts in; when set, the label (and an optional
 * description) are edit-in-place, with a ✕ to remove. Wrapped in a spec-level `PROV_INPUT`
 * `ProvSpan` so hovering it lights the emitted `[label]` / header lines, and vice versa.
 *
 * The row is driven by the RAW `spec.input` (not the `launchInput` guard), so it stays open
 * even when the name is blanked — only the ✕ removes it. A blank name is a valid transient
 * state; once the field is left empty (blur), a red "name required" warning is shown until a
 * name is typed. The empty spec is flagged globally by `validateSpec` (TopBar pill) too.
 */
export function InputNote() {
  const input = useWorkflowStore((s) => s.spec.input)
  const setInput = useWorkflowStore((s) => s.setInput)
  const [touched, setTouched] = useState(false)

  if (!input) {
    return (
      <p className="-mx-1 mt-2 px-1 text-[13px] text-ink-faint">
        <button
          type="button"
          onClick={() => setInput({ label: 'input' })}
          className="rounded-md border border-dashed border-rule px-1.5 py-0.5 font-mono text-[12px] text-ink-faint hover:border-focus hover:text-ink-dim"
        >
          + add launch input
        </button>
      </p>
    )
  }

  const nameMissing = touched && input.label.trim() === ''

  return (
    <ProvSpan
      keys={[PROV_INPUT]}
      as="p"
      className="-mx-1 mt-2 flex flex-wrap items-baseline gap-x-1.5 px-1 text-[15px] text-ink-dim"
    >
      Takes a launch input:{' '}
      <input
        aria-label="launch input label"
        value={input.label}
        spellCheck={false}
        onChange={(e) => setInput({ ...input, label: e.target.value })}
        onBlur={() => setTouched(true)}
        className={cn(
          'w-[12ch] border-b border-dashed bg-transparent font-mono text-[14px] text-intended outline-none hover:border-focus focus:border-focus',
          nameMissing ? 'border-danger' : 'border-rule',
        )}
      />
      <span className="text-ink-faint">—</span>
      <input
        aria-label="launch input description"
        value={input.description ?? ''}
        placeholder="what to pass (optional)"
        spellCheck={false}
        onChange={(e) =>
          setInput({
            label: input.label,
            ...(e.target.value ? { description: e.target.value } : {}),
          })
        }
        className="min-w-[16ch] flex-1 border-b border-dashed border-transparent bg-transparent text-[14px] text-ink-dim outline-none placeholder:text-ink-faint hover:border-rule focus:border-focus"
      />
      <button
        type="button"
        aria-label="remove launch input"
        onClick={() => setInput(undefined)}
        className="ml-0.5 rounded px-1 font-mono text-[12px] text-ink-faint hover:text-danger"
      >
        ✕
      </button>
      {nameMissing && (
        <span role="alert" className="font-mono text-[12px] text-danger">
          name required
        </span>
      )}
    </ProvSpan>
  )
}
