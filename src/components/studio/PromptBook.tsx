import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useUiStore } from '@/store/uiStore'
import { emitScript, emitScriptLines, type EmitLine } from '@/emit/scriptEmitter'
import { emitPrompt } from '@/emit/promptEmitter'
import { useCopy } from '@/lib/useCopy'
import { track } from '@/api/analytics'
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
 * `--phue` (its primary agent's model family), computed once here since the prompt-book column has
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
 * Lights via the SAME `useProv` hook the rundown fields use — hovering a line sets
 * `provHover` to its first provenance key, exactly like hovering the rundown field does; a
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
 * The prompt-book column (mockup `.script`): a togglable pane showing the live emitted artifact —
 * Script (runtime-valid `.js`, per-line two-way provenance) or Prompt (structured-Markdown
 * fallback, a plain `<pre>` — no provenance hover, per the M4 scope: the prompt path isn't the
 * enforced one). At md+ it is the side column whose width animates to zero when closed; below
 * md it is the full-screen Script mode of the mobile bar (`mobilePane`), where it also carries
 * the Copy button the mobile top bar has no room for.
 */
export function PromptBook() {
  const spec = useWorkflowStore((s) => s.spec)
  const showScript = useUiStore((s) => s.showScript)
  const mobilePane = useUiStore((s) => s.mobilePane)
  const promptBookTab = useUiStore((s) => s.promptBookTab)
  const setPromptBookTab = useUiStore((s) => s.setPromptBookTab)
  const [copied, copy] = useCopy()

  const lines = useMemo(() => emitScriptLines(spec), [spec])
  const hues = useMemo(() => phaseHues(spec), [spec])
  const promptArtifact = useMemo(() => emitPrompt(spec), [spec])

  const copyActive = () => {
    copy(promptBookTab === 'prompt' ? promptArtifact : emitScript(spec))
    track('workflow_copy', { format: promptBookTab === 'prompt' ? 'prompt' : 'script' })
  }

  return (
    <aside
      aria-label="Emitted script"
      className={cn(
        // md+: the fixed side column (width animates open/closed, exactly as before)
        'flex flex-none flex-col overflow-hidden border-l border-rule-soft bg-paper-2 md:transition-[width] md:duration-200',
        showScript ? 'md:[width:min(520px,42vw)]' : 'md:[width:0px]',
        // below md: a full-bleed pane, present only in the mobile bar's Script mode
        'max-md:min-w-0 max-md:flex-1 max-md:border-l-0',
        mobilePane !== 'script' && 'max-md:hidden',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col md:min-w-[460px]">
        <div className="flex items-baseline gap-2.5 px-4 pt-4 pb-2.5 md:px-5">
          <span className="font-mono text-[10px] tracking-[0.16em] text-ink-dim uppercase">
            The prompt book — exactly what will run
          </span>
          <button
            type="button"
            onClick={copyActive}
            className={cn(
              'ml-auto self-center rounded-lg border border-ink bg-ink px-3 py-1.5 font-mono text-[11px] font-medium text-paper md:hidden',
              copied && 'border-enforced bg-enforced',
            )}
          >
            {copied ? '✓ Copied' : promptBookTab === 'prompt' ? 'Copy prompt' : 'Copy script'}
          </button>
        </div>

        <div className="flex gap-0.5 px-4" role="tablist" aria-label="Artifact projection">
          <button
            role="tab"
            aria-selected={promptBookTab === 'script'}
            onClick={() => setPromptBookTab('script')}
            className={cn(
              'rounded-t-md border px-2.5 py-1 font-mono text-[11px]',
              promptBookTab === 'script'
                ? 'border-rule-soft border-b-transparent bg-paper text-ink'
                : 'border-transparent text-ink-faint hover:text-ink-dim',
            )}
          >
            Script
          </button>
          <button
            role="tab"
            aria-selected={promptBookTab === 'prompt'}
            onClick={() => setPromptBookTab('prompt')}
            className={cn(
              'rounded-t-md border px-2.5 py-1 font-mono text-[11px]',
              promptBookTab === 'prompt'
                ? 'border-rule-soft border-b-transparent bg-paper text-ink'
                : 'border-transparent text-ink-faint hover:text-ink-dim',
            )}
          >
            Prompt
          </button>
        </div>

        {promptBookTab === 'script' ? (
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
          {promptBookTab === 'script'
            ? '◈ every marked line traces to exactly one thing on the rundown — hover either side. Nothing in this script comes from anywhere else.'
            : 'Durable structured-Markdown fallback. Claude authors the orchestration here, so the model pin is a request, not a guarantee.'}
        </div>
      </div>
    </aside>
  )
}
