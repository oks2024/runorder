import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { validateSpec } from '@/spec/validate'
import { estimateRunSize } from '@/lib/estimate'
import { emitScript } from '@/emit/scriptEmitter'
import { emitPrompt } from '@/emit/promptEmitter'
import { useCopy } from '@/lib/useCopy'
import { cn } from '@/lib/utils'
import { LibraryMenu } from './LibraryMenu'

/**
 * The Studio top bar (mockup `.top`): doc label + workflow name (display), the
 * Worksheet⇄Rehearsal switch (rehearsal disabled until M3), the receipt toggle with its LED,
 * a live validity/estimate status pill (derived every render), and Copy emit (copies the
 * active receipt tab — the script when the column is closed).
 */
export function TopBar() {
  const spec = useWorkflowStore((s) => s.spec)
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const showScript = useUiStore((s) => s.showScript)
  const setShowScript = useUiStore((s) => s.setShowScript)
  const receiptTab = useUiStore((s) => s.receiptTab)
  const [copied, copy] = useCopy()

  const result = validateSpec(spec)
  const issueCount = result.ok ? 0 : result.issues.length
  const rehearsing = view === 'rehearsal'

  const copyActive = () => {
    const useScript = !showScript || receiptTab === 'script'
    copy(useScript ? emitScript(spec) : emitPrompt(spec))
  }

  return (
    <div className="flex items-center gap-4 border-b-2 border-ink bg-paper px-6 py-3">
      <span className="font-mono text-[13px] font-bold tracking-tight text-ink">
        Playsheet
      </span>
      <span
        data-testid="doc-label"
        className="font-mono text-[10px] tracking-[0.18em] text-ink-faint uppercase"
      >
        {rehearsing ? 'Rehearsal' : 'Worksheet'}
      </span>
      <span className="font-mono text-[15px] font-semibold text-ink">{spec.name}</span>
      <div className="flex-1" />

      <div className="inline-flex overflow-hidden rounded-lg border border-rule bg-paper-2" role="tablist" aria-label="View">
        <button
          role="tab"
          aria-selected={!rehearsing}
          onClick={() => setView('worksheet')}
          className={cn(
            'px-4 py-1.5 font-mono text-[11.5px]',
            !rehearsing ? 'bg-ink font-medium text-paper' : 'text-ink-faint hover:text-ink',
          )}
        >
          Worksheet
        </button>
        <button
          role="tab"
          aria-selected={rehearsing}
          onClick={() => setView('rehearsal')}
          className={cn(
            'px-4 py-1.5 font-mono text-[11.5px]',
            rehearsing ? 'bg-ink font-medium text-paper' : 'text-ink-faint hover:text-ink',
          )}
        >
          Rehearsal
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowScript(!showScript)}
        aria-pressed={showScript}
        disabled={rehearsing}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[11px]',
          showScript ? 'border-ink-dim text-ink' : 'border-rule text-ink-dim',
          rehearsing && 'pointer-events-none opacity-40',
        )}
      >
        <span
          className="inline-block size-[7px] rounded-full"
          style={{ background: showScript ? 'var(--color-enforced)' : 'var(--color-rule)' }}
        />
        Script
      </button>

      <span
        className={cn(
          'font-mono text-[10.5px]',
          issueCount === 0 ? 'text-enforced' : 'text-danger',
        )}
      >
        <span aria-hidden>● </span>
        {issueCount === 0
          ? `valid · est ≤ ${estimateRunSize(spec)} agents`
          : `${issueCount} issue${issueCount === 1 ? '' : 's'}`}
      </span>

      <LibraryMenu />

      <button
        type="button"
        onClick={copyActive}
        className={cn(
          'rounded-lg border border-ink bg-ink px-3.5 py-1.5 font-mono text-[12px] font-medium text-paper',
          copied && 'border-enforced bg-enforced',
        )}
      >
        {copied ? '✓ Copied' : 'Copy emit'}
      </button>
    </div>
  )
}
