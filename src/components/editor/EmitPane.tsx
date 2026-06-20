import { useWorkflowStore } from '@/store/workflowStore'
import { emitPrompt } from '@/emit/promptEmitter'
import { cn } from '@/lib/utils'
import { useCopy } from './useCopy'

/**
 * Live readout of the single structured-Markdown artifact (verbatim emitPrompt output).
 * The Script tab is deferred (V2). Copy → paste into Claude Code → approve → run.
 */
export function EmitPane() {
  const artifact = useWorkflowStore((s) => emitPrompt(s.spec))
  const [copied, copy] = useCopy()

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-panel shadow-[0_8px_22px_oklch(0_0_0/0.28)]">
      <div className="flex items-center gap-2 border-b border-line-soft px-3.5 py-2.5">
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-ink-faint uppercase">
          CH·03
        </span>
        <span className="text-[13px] font-semibold">Emit</span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-enforced uppercase">
          <span className="size-[7px] animate-pulse rounded-full bg-enforced shadow-[0_0_8px_var(--color-enforced)]" />
          Live readout
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex gap-0.5 px-3 pt-2.5" role="tablist" aria-label="Artifact projection">
          <button
            role="tab"
            aria-selected="true"
            className="rounded-t-md border border-line-soft border-b-well bg-well px-2.5 py-1.5 font-mono text-[11px] text-ink"
          >
            Prompt artifact
          </button>
          <button
            role="tab"
            aria-selected="false"
            disabled
            title="Script emitter is deferred (V2). Version-tagged, validated by running fixtures."
            className="rounded-t-md border border-transparent px-2.5 py-1.5 font-mono text-[11px] text-ink-faint opacity-60"
          >
            Script <span className="ml-1 text-[8.5px] tracking-[0.1em] text-intended">DEFERRED · V2</span>
          </button>
        </div>

        <div className="flex items-center gap-2 border-y border-line-soft bg-well px-3 py-2">
          <span className="font-mono text-[11px] text-ink-faint">
            ▸ paste into Claude Code · approve · run
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className={cn(
              'rounded-md border border-line bg-panel2 px-2.5 py-1 font-mono text-[11px] text-ink hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-focus',
              copied && 'border-enforced/45 text-enforced',
            )}
            onClick={() => copy(artifact)}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-well">
          <pre className="m-0 px-4 py-3.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-dim">
            {artifact}
          </pre>
        </div>
      </div>
    </section>
  )
}
