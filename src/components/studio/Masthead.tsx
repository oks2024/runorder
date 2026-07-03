import { useWorkflowStore } from '@/store/workflowStore'

/**
 * The worksheet title: the workflow name as a controlled, edit-in-place input (mockup
 * `.mast h1` — mono, 26px, dashed underline on hover). Binds straight to `setName`.
 */
export function Masthead() {
  const name = useWorkflowStore((s) => s.spec.name)
  const setName = useWorkflowStore((s) => s.setName)

  return (
    <div className="flex items-baseline gap-3">
      <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">
        <input
          aria-label="workflow name"
          value={name}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          className="w-full border-b border-dashed border-transparent bg-transparent font-mono text-[26px] font-semibold text-ink outline-none hover:border-rule focus:border-focus"
        />
      </h1>
    </div>
  )
}
