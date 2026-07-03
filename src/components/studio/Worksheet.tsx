import { useWorkflowStore } from '@/store/workflowStore'
import type { EditableNode } from './roles'
import { Masthead } from './Masthead'
import { Lede } from './Lede'
import { PhaseSection } from './PhaseSection'
import { Seam } from './Seam'
import { DropEnd } from './DropEnd'

/**
 * The worksheet document (mockup `.sheet-scroll` / `.sheet`): a light literate spec — the
 * masthead, the caps lede, one `PhaseSection` per root step (interleaved with drop `Seam`s so
 * a dragged pattern can be inserted anywhere, including before phase 1), a trailing `DropEnd`
 * to append, and a closing colophon. A non-sequence root or a nested-sequence step renders a
 * "flatten it" notice rather than crashing — the same honesty as the emitter, which throws on
 * those.
 */
export function Worksheet() {
  const spec = useWorkflowStore((s) => s.spec)
  const root = spec.root
  const isSequence = root.type === 'sequence'
  const steps = root.type === 'sequence' ? root.steps : []

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <main className="mx-auto max-w-[720px] px-7 pt-11 pb-24">
        <Masthead />
        <Lede />

        {!isSequence ? (
          <p className="mt-8 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-danger">
            This workflow's root is a <code>{spec.root.type}</code>, not a sequence. The worksheet
            edits a flat, ordered phase list — flatten the root to a sequence to work on it here.
          </p>
        ) : (
          <>
            <Seam index={0} />
            {steps.map((node, i) => (
              <div key={('id' in node && node.id) || i}>
                {node.type === 'sequence' ? (
                  <p className="mt-5 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-danger">
                    Phase {i + 1} is a nested sequence — flatten it into top-level phases to edit
                    it here.
                  </p>
                ) : (
                  <PhaseSection
                    node={node as EditableNode}
                    index={i}
                    count={steps.length}
                    phases={steps}
                  />
                )}
                {i < steps.length - 1 && <Seam index={i + 1} />}
              </div>
            ))}
            <DropEnd index={steps.length} empty={steps.length === 0} />
          </>
        )}

        <p className="mt-14 max-w-[52ch] border-t border-rule pt-3.5 text-[12.5px] text-ink-faint">
          This worksheet is the spec; the script beside it is the receipt — the exact code that
          will run. Switch to Rehearsal for a read-only dry-run of this page.
        </p>
      </main>
    </div>
  )
}
