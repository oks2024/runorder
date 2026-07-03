import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { emitScriptLines, type EmitLine } from '@/emit/scriptEmitter'
import { emitPrompt } from '@/emit/promptEmitter'
import { PROV_CAPS } from '@/lib/prov'
import { primaryRef } from '@/lib/nodeRoles'
import { INHERIT } from '@/lib/models'
import { hueVar } from './hue'
import { useProv } from './useProv'
import { tintLine } from './tintLine'
import { cn } from '@/lib/utils'
import type { WorkflowSpec } from '@/spec/schema'

/**
 * Phase index → the phase's PRIMARY agent's model-family hue. Mirrors `PhaseSection`'s
 * `--phue` (its primary agent's model family), computed once here since the receipt column has
 * no phase DOM of its own to inherit the CSS var from.
 */
function phaseHues(spec: WorkflowSpec): string[] {
  const phases = spec.root.type === 'sequence' ? spec.root.steps : []
  return phases.map((node) => {
    const ref = node.type === 'sequence' ? null : primaryRef(node)
    const agent = ref ? spec.agents.find((a) => a.id === ref) : undefined
    return hueVar(agent?.model ?? INHERIT)
  })
}

/**
 * One emitted line (mockup `.eline`): line number · ◈ gutter mark when tagged · tinted text.
 * Lights via the SAME `useProv` hook the worksheet fields use — hovering a line sets
 * `provHover` to its first provenance key, exactly like hovering the worksheet field does; a
 * line lights when the hovered key is ANY of its own (a line can honestly carry several keys).
 */
function ScriptLine({ line, no, hue }: { line: EmitLine; no: number; hue?: string }) {
  const { lit, hoverProps } = useProv(line.prov)
  const hasProv = !!line.prov?.length

  return (
    <div
      data-prov={hasProv ? line.prov!.join(' ') : undefined}
      {...(hasProv ? hoverProps : {})}
      className={cn(
        // w-max + min-w-full lets long lines widen the scroll container (the 1fr track alone
        // would clip them at the pane edge with no way to scroll)
        'eline grid w-max min-w-full grid-cols-[30px_13px_1fr] items-baseline gap-x-[7px] px-4 font-mono text-[11px] leading-[1.8] whitespace-pre text-ink-dim',
        lit && 'lit rounded-sm',
      )}
      style={{
        ...(hue ? ({ '--phue': hue } as CSSProperties) : undefined),
        ...(lit
          ? {
              background:
                'color-mix(in oklch, var(--phue, var(--color-sonnet)) 10%, var(--color-paper-2))',
              boxShadow: 'inset 2.5px 0 0 var(--phue, var(--color-sonnet))',
            }
          : undefined),
      }}
    >
      <span className="text-right text-[9px] text-ink-faint opacity-60 select-none">{no}</span>
      <span className="text-center text-[9px] text-ink-faint select-none" aria-hidden>
        {hasProv ? '◈' : ''}
      </span>
      <span>{tintLine(line.text)}</span>
    </div>
  )
}

/**
 * The receipt column (mockup `.script`): a togglable pane showing the live emitted artifact —
 * Script (runtime-valid `.js`, per-line two-way provenance) or Prompt (structured-Markdown
 * fallback, a plain `<pre>` — no provenance hover, per the M4 scope: the prompt path isn't the
 * enforced one). Width animates to zero when closed. The "runtime-tagged" stamp marks the
 * script as version-pinned.
 */
export function ReceiptColumn() {
  const spec = useWorkflowStore((s) => s.spec)
  const showScript = useUiStore((s) => s.showScript)
  const receiptTab = useUiStore((s) => s.receiptTab)
  const setReceiptTab = useUiStore((s) => s.setReceiptTab)

  const lines = useMemo(() => emitScriptLines(spec), [spec])
  const hues = useMemo(() => phaseHues(spec), [spec])
  const promptArtifact = useMemo(() => emitPrompt(spec), [spec])

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
            style={{
              border: '1.5px solid color-mix(in oklch, var(--color-enforced) 45%, var(--color-rule))',
            }}
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

        {receiptTab === 'script' ? (
          <div
            data-testid="script-body"
            className="min-h-0 flex-1 overflow-auto border-t border-rule-soft bg-paper py-1 pb-6"
          >
            {lines.map((line, i) => (
              <ScriptLine
                key={i}
                line={line}
                no={i + 1}
                hue={
                  line.prov?.includes(PROV_CAPS)
                    ? 'var(--color-intended)'
                    : line.phaseIndex !== undefined
                      ? hues[line.phaseIndex]
                      : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto border-t border-rule-soft bg-paper">
            <pre className="m-0 px-4 py-3.5 font-mono text-[11px] leading-[1.8] whitespace-pre-wrap text-ink-dim">
              {promptArtifact}
            </pre>
          </div>
        )}

        <div className="border-t border-rule-soft px-5 py-2.5 font-mono text-[9.5px] leading-relaxed text-ink-faint">
          {receiptTab === 'script'
            ? '◈ every marked line traces to exactly one thing on the worksheet — hover either side. Nothing in this script comes from anywhere else.'
            : 'Durable structured-Markdown fallback. Claude authors the orchestration here, so the model pin is a request, not a guarantee.'}
        </div>
      </div>
    </aside>
  )
}
