import { useWorkflowStore } from '@/store/workflowStore'
import { deriveMemoryNames } from '@/lib/memoryNames'
import { isSchemaForced } from '@/emit/plumbing'
import { provKey } from '@/lib/prov'
import { ProvSpan } from './ProvSpan'
import type { EditableNode } from './roles'

/**
 * The mono flow-note under a phase (mockup `.flow-note`): the memories this phase reads (as
 * removable chips) plus a "+ read…" picker of earlier memories, then where its output goes —
 * a named memory, or "final output of the run" for the last phase. When the phase is
 * schema-forced (the next phase consumes it as items), the honest `{ context, items }` note
 * is appended.
 * Reads/names are id-based and re-derived here, so the label matches what the script splices.
 */
export function FlowNote({
  node,
  index,
  count,
}: {
  node: EditableNode
  index: number
  count: number
}) {
  const spec = useWorkflowStore((s) => s.spec)
  const setReads = useWorkflowStore((s) => s.setReads)

  const nodeId = 'id' in node ? node.id : undefined
  const phases = spec.root.type === 'sequence' ? spec.root.steps : []
  const memories = deriveMemoryNames(spec) // aligned with `phases` by index
  const memoryAt = new Map<string, { name: string; at: number }>()
  memories.forEach((m, at) => {
    if (m.nodeId) memoryAt.set(m.nodeId, { name: m.name, at })
  })

  const reads = node.reads ?? []
  const readable = memories
    .slice(0, index)
    .filter((m): m is { nodeId: string; name: string } => !!m.nodeId && !reads.includes(m.nodeId))

  const outName = memories[index]?.name ?? `phase-${index + 1}`
  const isLast = index === count - 1
  const forced = phases.length > index && isSchemaForced(phases, index)
  const showReads = reads.length > 0 || readable.length > 0

  const mem = 'rounded-[4px] border border-rule-soft bg-paper-2 px-1.5 font-medium text-ink-dim'

  return (
    <p className="mt-3 font-mono text-[11.5px] text-ink-faint">
      {showReads && (
        <>
          <ProvSpan keys={nodeId ? provKey(nodeId, 'reads') : undefined} className="-mx-1 px-1">
            {reads.length > 0 && 'reads: '}
            {reads.map((target) => {
              const hit = memoryAt.get(target)
              const valid = hit !== undefined && hit.at < index
              return (
                <button
                  key={target}
                  type="button"
                  className={
                    valid
                      ? `${mem} mr-1 hover:border-danger hover:text-danger`
                      : 'mr-1 rounded-[4px] border border-danger/50 bg-danger/10 px-1.5 font-medium text-danger'
                  }
                  title={
                    valid
                      ? `Remove read "${hit.name}"`
                      : `Unresolved read "${target}" — its phase is gone or later; click to remove`
                  }
                  onClick={() =>
                    setReads(
                      index,
                      reads.filter((r) => r !== target),
                    )
                  }
                >
                  [{valid ? hit.name : `${target}?`}] ×
                </button>
              )
            })}
            {readable.length > 0 && (
              <select
                value=""
                aria-label="Add read"
                className="mr-1 rounded-[4px] border border-dashed border-rule bg-transparent px-1 font-mono text-[11px] text-ink-faint outline-none hover:border-ink-faint hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-focus"
                onChange={(e) => {
                  if (e.target.value) setReads(index, [...reads, e.target.value])
                }}
              >
                <option value="">+ read…</option>
                {readable.map((m) => (
                  <option key={m.nodeId} value={m.nodeId}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </ProvSpan>
          &nbsp;·&nbsp;
        </>
      )}
      {isLast ? (
        <>→ final output of the run</>
      ) : (
        <>
          → output saved as <span className={mem}>{outName}</span>
        </>
      )}
      {forced && (
        <ProvSpan keys={nodeId ? provKey(nodeId, 'schema') : undefined} className="-mx-1 px-1">
          , schema-forced to <span className={mem}>{'{ context, items }'}</span> because the
          next phase consumes it as items
        </ProvSpan>
      )}
    </p>
  )
}
