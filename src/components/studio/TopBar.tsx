import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { validateSpec } from '@/spec/validate'
import { estimateRunSize } from '@/lib/estimate'
import { emitScript } from '@/emit/scriptEmitter'
import { emitPrompt } from '@/emit/promptEmitter'
import { useCopy } from '@/lib/useCopy'
import { track } from '@/api/analytics'
import { cn } from '@/lib/utils'
import { LibraryMenu } from './LibraryMenu'
import { AuthButton } from './AuthButton'

/**
 * The Studio top bar (mockup `.top`): doc label + workflow name (display), the
 * Rundown⇄Rehearsal switch (rehearsal disabled until M3), the prompt-book toggle with its LED,
 * a live validity/estimate status pill (derived every render), and Copy script (copies the
 * active prompt-book tab — the script when the column is closed).
 */
export function TopBar() {
  const spec = useWorkflowStore((s) => s.spec)
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const showScript = useUiStore((s) => s.showScript)
  const setShowScript = useUiStore((s) => s.setShowScript)
  const promptBookTab = useUiStore((s) => s.promptBookTab)
  const [copied, copy] = useCopy()

  const result = validateSpec(spec)
  const issueCount = result.ok ? 0 : result.issues.length
  const rehearsing = view === 'rehearsal'

  const copyActive = () => {
    const useScript = !showScript || promptBookTab === 'script'
    copy(useScript ? emitScript(spec) : emitPrompt(spec))
    track('workflow_copy', { format: useScript ? 'script' : 'prompt' })
  }

  return (
    <div className="flex items-center gap-2.5 border-b-2 border-ink bg-paper px-4 py-2.5 md:gap-4 md:px-6 md:py-3">
      <span className="font-mono text-[13px] font-bold tracking-tight text-ink">
        Runorder
      </span>
      <span
        data-testid="doc-label"
        className="hidden font-mono text-[10px] tracking-[0.18em] text-ink-faint uppercase md:inline"
      >
        {rehearsing ? 'Rehearsal' : 'Rundown'}
      </span>
      <span className="min-w-0 truncate font-mono text-[15px] font-semibold text-ink">
        {spec.name}
      </span>
      <div className="flex-1" />

      <div className="hidden overflow-hidden rounded-lg border border-rule bg-paper-2 md:inline-flex" role="tablist" aria-label="View">
        <button
          role="tab"
          aria-selected={!rehearsing}
          onClick={() => setView('rundown')}
          className={cn(
            'px-4 py-1.5 font-mono text-[11.5px]',
            !rehearsing ? 'bg-ink font-medium text-paper' : 'text-ink-faint hover:text-ink',
          )}
        >
          Rundown
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
          'hidden items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[11px] md:inline-flex',
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
        title={
          issueCount === 0
            ? `valid · est ≤ ${estimateRunSize(spec)} agents`
            : `${issueCount} issue${issueCount === 1 ? '' : 's'}`
        }
        className={cn(
          'font-mono text-[10.5px] whitespace-nowrap',
          issueCount === 0 ? 'text-enforced' : 'text-danger',
        )}
      >
        <span aria-hidden>● </span>
        {/* full text at md+; on mobile just the dot (plus a count when invalid) */}
        <span className="sr-only md:not-sr-only">
          {issueCount === 0
            ? `valid · est ≤ ${estimateRunSize(spec)} agents`
            : `${issueCount} issue${issueCount === 1 ? '' : 's'}`}
        </span>
        {issueCount > 0 && (
          <span aria-hidden className="md:hidden">
            {issueCount}
          </span>
        )}
      </span>

      <LibraryMenu />
      <AuthButton />

      <button
        type="button"
        onClick={copyActive}
        className={cn(
          'hidden rounded-lg border border-ink bg-ink px-3.5 py-1.5 font-mono text-[12px] font-medium text-paper md:block',
          copied && 'border-enforced bg-enforced',
        )}
      >
        {copied ? '✓ Copied' : 'Copy script'}
      </button>
    </div>
  )
}
