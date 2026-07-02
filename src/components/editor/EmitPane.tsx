import { useState } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { emitPrompt } from '@/emit/promptEmitter'
import { emitScript } from '@/emit/scriptEmitter'
import { cn } from '@/lib/utils'
import { useCopy } from './useCopy'

type Projection = 'script' | 'prompt'

/**
 * Live readout of an emitted artifact. Two projections of the same spec:
 *   - Script (primary): runtime-valid `.js` — per-stage model routing is executed literally,
 *     so the model pin is a real, checkable guarantee (see OpenQuestions.md, Findings 2026-07-02).
 *   - Prompt (fallback): the durable structured-Markdown artifact — resilient to API churn,
 *     but Claude authors the orchestration, so the model pin is a *request*, not enforcement.
 * Copy → paste/save into Claude Code → approve → run.
 */
export function EmitPane() {
  const spec = useWorkflowStore((s) => s.spec)
  const [projection, setProjection] = useState<Projection>('script')
  const [copied, copy] = useCopy()

  const artifact = projection === 'script' ? emitScript(spec) : emitPrompt(spec)
  const hint =
    projection === 'script'
      ? '▸ save as .claude/workflows/…js · approve · run'
      : '▸ paste into Claude Code · approve · run'

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
            aria-selected={projection === 'script'}
            onClick={() => setProjection('script')}
            title="Runtime-valid JS. Per-stage models are executed literally — enforced, not requested."
            className={cn(
              'rounded-t-md border px-2.5 py-1.5 font-mono text-[11px]',
              projection === 'script'
                ? 'border-line-soft border-b-well bg-well text-ink'
                : 'border-transparent text-ink-faint hover:text-ink-dim',
            )}
          >
            Script{' '}
            <span className="ml-1 text-[8.5px] tracking-[0.1em] text-enforced">ENFORCED</span>
          </button>
          <button
            role="tab"
            aria-selected={projection === 'prompt'}
            onClick={() => setProjection('prompt')}
            title="Structured-Markdown fallback. Durable across API churn, but Claude authors the orchestration — the model pin is a request, not a guarantee."
            className={cn(
              'rounded-t-md border px-2.5 py-1.5 font-mono text-[11px]',
              projection === 'prompt'
                ? 'border-line-soft border-b-well bg-well text-ink'
                : 'border-transparent text-ink-faint hover:text-ink-dim',
            )}
          >
            Prompt{' '}
            <span className="ml-1 text-[8.5px] tracking-[0.1em] text-intended">FALLBACK</span>
          </button>
        </div>

        <div className="flex items-center gap-2 border-y border-line-soft bg-well px-3 py-2">
          <span className="font-mono text-[11px] text-ink-faint">{hint}</span>
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
