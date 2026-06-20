import { useWorkflowStore } from '@/store/workflowStore'
import { validateSpec } from '@/spec/validate'
import { emitPrompt } from '@/emit/promptEmitter'
import { cn } from '@/lib/utils'
import { useCopy } from './useCopy'

export function TopBar() {
  const name = useWorkflowStore((s) => s.spec.name)
  const setName = useWorkflowStore((s) => s.setName)
  const spec = useWorkflowStore((s) => s.spec)
  const [copied, copy] = useCopy()

  const result = validateSpec(spec)
  const issueCount = result.ok ? 0 : result.issues.length
  const valid = issueCount === 0

  return (
    <header className="flex items-center gap-4 border-b border-line bg-gradient-to-b from-panel to-panel2 px-[18px] py-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="size-[9px] self-center rounded-full bg-enforced shadow-[0_0_8px_var(--color-enforced)]" />
        <span className="font-mono font-semibold tracking-[0.02em]">DWE</span>
        <span className="font-mono text-[11px] tracking-[0.12em] text-ink-faint uppercase">
          Dynamic&nbsp;Workflow&nbsp;Editor
        </span>
      </div>

      <span className="inline-flex items-center">
        <span className="mr-0.5 font-mono text-xs text-ink-faint">workflow /</span>
        <input
          className="min-w-[150px] rounded-md border border-line-soft bg-well px-2 py-1 font-mono text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Workflow name"
        />
      </span>

      <span className="flex-1" />

      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px] tracking-[0.04em]',
          valid
            ? 'border-enforced/40 bg-enforced/10 text-enforced'
            : 'border-danger/40 bg-danger/10 text-danger',
        )}
        aria-live="polite"
      >
        <span
          className={cn(
            'size-[7px] rounded-full',
            valid
              ? 'bg-enforced shadow-[0_0_6px_var(--color-enforced)]'
              : 'bg-danger shadow-[0_0_6px_var(--color-danger)]',
          )}
        />
        {valid ? 'Valid · 0 issues' : `${issueCount} issue${issueCount === 1 ? '' : 's'}`}
      </span>

      <button
        type="button"
        className="rounded-md border border-line bg-panel2 px-3 py-1.5 font-mono text-xs text-ink hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-focus"
        onClick={() => copy(emitPrompt(spec))}
      >
        {copied ? '✓ Copied' : 'Emit artifact'}
      </button>
    </header>
  )
}
