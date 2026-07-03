import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { emitScript } from '@/emit/scriptEmitter'
import { emitPrompt } from '@/emit/promptEmitter'
import { cn } from '@/lib/utils'

/**
 * The receipt column (mockup `.script`): a togglable pane showing the live emitted artifact —
 * Script (runtime-valid `.js`, primary) or Prompt (structured-Markdown fallback). M1 renders
 * a plain scrollable `<pre>`; M4 upgrades the Script tab to per-line provenance. Width
 * animates to zero when closed. The "runtime-tagged" stamp marks the script as version-pinned.
 */
export function ReceiptColumn() {
  const spec = useWorkflowStore((s) => s.spec)
  const showScript = useUiStore((s) => s.showScript)
  const receiptTab = useUiStore((s) => s.receiptTab)
  const setReceiptTab = useUiStore((s) => s.setReceiptTab)

  const artifact = receiptTab === 'script' ? emitScript(spec) : emitPrompt(spec)

  return (
    <aside
      aria-label="Emitted script"
      className="flex flex-none flex-col overflow-hidden border-l border-rule-soft bg-paper-2 transition-[width] duration-200"
      style={{ width: showScript ? 'min(520px, 42vw)' : 0 }}
    >
      <div className="flex min-h-0 min-w-[460px] flex-1 flex-col">
        <div className="flex items-baseline gap-2.5 px-5 pt-4 pb-2.5">
          <span className="font-mono text-[10px] tracking-[0.16em] text-ink-dim uppercase">
            The receipt — what will run
          </span>
          <span
            className="ml-auto rounded-[4px] px-1.5 font-mono text-[8.5px] tracking-[0.14em] text-enforced uppercase [rotate:-2deg]"
            style={{ border: '1.5px solid color-mix(in oklch, var(--color-enforced) 45%, var(--color-rule))' }}
          >
            runtime-tagged
          </span>
        </div>

        <div className="flex gap-0.5 px-4" role="tablist" aria-label="Artifact projection">
          <button
            role="tab"
            aria-selected={receiptTab === 'script'}
            onClick={() => setReceiptTab('script')}
            className={cn(
              'rounded-t-md border px-2.5 py-1 font-mono text-[11px]',
              receiptTab === 'script'
                ? 'border-rule-soft border-b-transparent bg-paper text-ink'
                : 'border-transparent text-ink-faint hover:text-ink-dim',
            )}
          >
            Script
          </button>
          <button
            role="tab"
            aria-selected={receiptTab === 'prompt'}
            onClick={() => setReceiptTab('prompt')}
            className={cn(
              'rounded-t-md border px-2.5 py-1 font-mono text-[11px]',
              receiptTab === 'prompt'
                ? 'border-rule-soft border-b-transparent bg-paper text-ink'
                : 'border-transparent text-ink-faint hover:text-ink-dim',
            )}
          >
            Prompt
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto border-t border-rule-soft bg-paper">
          <pre className="m-0 px-4 py-3.5 font-mono text-[11px] leading-[1.8] whitespace-pre-wrap text-ink-dim">
            {artifact}
          </pre>
        </div>

        <div className="border-t border-rule-soft px-5 py-2.5 font-mono text-[9.5px] leading-relaxed text-ink-faint">
          {receiptTab === 'script'
            ? 'This is the exact runtime-valid script that will run — one-way export. Edit the worksheet, not this file.'
            : 'Durable structured-Markdown fallback. Claude authors the orchestration here, so the model pin is a request, not a guarantee.'}
        </div>
      </div>
    </aside>
  )
}
