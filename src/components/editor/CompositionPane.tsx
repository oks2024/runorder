import { useWorkflowStore } from '@/store/workflowStore'
import { Pane } from './Pane'
import { PhaseRow } from './PhaseRow'
import { PATTERN_INFO, type PatternKey } from './patternInfo'

/** The center pane: a flat ordered phase list over `root.steps` (V1 exposes one level). */
export function CompositionPane() {
  const phases = useWorkflowStore((s) => (s.spec.root.type === 'sequence' ? s.spec.root.steps : []))
  const addStep = useWorkflowStore((s) => s.addStep)
  const addFanout = useWorkflowStore((s) => s.addFanout)
  const addLoop = useWorkflowStore((s) => s.addLoop)
  const addMapReduce = useWorkflowStore((s) => s.addMapReduce)
  const addAdversarial = useWorkflowStore((s) => s.addAdversarial)
  const addMultiAngle = useWorkflowStore((s) => s.addMultiAngle)
  const addDelegate = useWorkflowStore((s) => s.addDelegate)

  const addBtn =
    'grow basis-[30%] rounded-[9px] border border-dashed border-line py-2 text-center font-mono text-xs text-ink-faint hover:border-intended/45 hover:text-intended focus-visible:outline-2 focus-visible:outline-focus'

  return (
    <Pane
      code="CH·02"
      title="Composition"
      headerExtra={
        <span
          className="rounded-[5px] border border-dashed border-line px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-ink-faint uppercase"
          title="The derived block-diagram / graph projection lands in V1.1"
        >
          ▦ diagram · V1.1
        </span>
      }
    >
      <div className="mb-3 rounded-lg border border-line-soft bg-well px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-faint">
        Ordered phases run top → down. Context flow is{' '}
        <b className="font-semibold text-ink-dim">explicit</b>: every phase's output is a named
        memory, and each phase receives exactly what its{' '}
        <b className="font-semibold text-ink-dim">reads</b> list — nothing flows implicitly. A{' '}
        <b className="font-semibold text-ink-dim">fan-out</b> additionally hands each worker one
        item; its producer (marked <b className="font-semibold text-ink-dim">items[]</b>) is
        schema-forced to return {'{ context, items }'}, so the item count is exact.
      </div>

      {phases.map((node, i) => (
        <div key={i}>
          {node.type !== 'sequence' ? (
            <PhaseRow node={node} index={i} count={phases.length} />
          ) : (
            <div className="mb-1 rounded-[10px] border border-dashed border-line p-2.5 font-mono text-[11px] text-ink-faint">
              {i + 1}. nested sequence — flatten it in the editor
            </div>
          )}
          {i < phases.length - 1 && (
            <div className="flex h-6 items-center justify-center" aria-hidden>
              <span className="h-full w-0.5 bg-ink-faint" />
            </div>
          )}
        </div>
      ))}

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ['step', () => addStep()],
            ['fanout', () => addFanout()],
            ['loop', () => addLoop()],
            ['mapReduce', () => addMapReduce()],
            ['adversarial', () => addAdversarial()],
            ['multiAngle', () => addMultiAngle()],
            ['delegate', () => addDelegate()],
          ] as [PatternKey, () => void][]
        ).map(([key, add]) => (
          <button
            key={key}
            type="button"
            className={
              key === 'step'
                ? 'grow basis-[30%] rounded-[9px] border border-dashed border-line py-2 text-center font-mono text-xs text-ink-faint hover:border-ink-faint hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-focus'
                : addBtn
            }
            title={PATTERN_INFO[key].tip}
            onClick={add}
          >
            {PATTERN_INFO[key].button}
          </button>
        ))}
      </div>
    </Pane>
  )
}
