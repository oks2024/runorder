import { useWorkflowStore } from '@/store/workflowStore'
import { Pane } from './Pane'
import { PhaseRow } from './PhaseRow'

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
        Ordered phases run top → down. Data flow is <b className="font-semibold text-ink-dim">implicit</b>:
        each phase passes its results forward. A{' '}
        <b className="font-semibold text-ink-dim">fan-out</b> maps the prior phase's output over one
        agent (dynamic count, bounded by its cap). A{' '}
        <b className="font-semibold text-ink-dim">loop</b> repeats one agent until it reports done
        (bounded by max iterations).
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
        <button
          type="button"
          className="grow basis-[30%] rounded-[9px] border border-dashed border-line py-2 text-center font-mono text-xs text-ink-faint hover:border-ink-faint hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-focus"
          onClick={() => addStep()}
        >
          + Step
        </button>
        <button type="button" className={addBtn} onClick={() => addFanout()}>
          + Fan-out
        </button>
        <button type="button" className={addBtn} onClick={() => addLoop()}>
          + Loop
        </button>
        <button type="button" className={addBtn} onClick={() => addMapReduce()}>
          + Map-reduce
        </button>
        <button type="button" className={addBtn} onClick={() => addAdversarial()}>
          + Adversarial
        </button>
        <button type="button" className={addBtn} onClick={() => addMultiAngle()}>
          + Multi-angle
        </button>
        <button type="button" className={addBtn} onClick={() => addDelegate()}>
          + Delegate
        </button>
      </div>
    </Pane>
  )
}
