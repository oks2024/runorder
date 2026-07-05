import { useWorkflowStore } from '@/store/workflowStore'
import { PROV_NAME } from '@/lib/prov'
import { ProvSpan } from './ProvSpan'

/**
 * The rundown title: the workflow name as a controlled, edit-in-place input (mockup
 * `.mast h1` — mono, 26px, dashed underline on hover). Binds straight to `setName`. Wrapped in
 * a `ProvSpan` (the workflow-level `name` key — no node id, so a spec-level constant) so
 * hovering it lights the `meta.name`/`meta.description` lines in the prompt-book, and vice versa.
 */
export function Masthead() {
  const name = useWorkflowStore((s) => s.spec.name)
  const setName = useWorkflowStore((s) => s.setName)

  return (
    <div className="flex items-baseline gap-3">
      <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">
        <ProvSpan keys={PROV_NAME} className="-mx-1 block px-1">
          <input
            aria-label="workflow name"
            value={name}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-b border-dashed border-transparent bg-transparent font-mono text-[26px] font-semibold text-ink outline-none hover:border-rule focus:border-focus"
          />
        </ProvSpan>
      </h1>
    </div>
  )
}
