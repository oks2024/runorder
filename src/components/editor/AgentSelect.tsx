import { useWorkflowStore } from '@/store/workflowStore'
import { cn } from '@/lib/utils'
import { hueVar, shortModel } from './hue'

/**
 * Picks which defined agent a phase runs. A styled native `<select>` (closed set, fully
 * accessible) with a model-family LED and mini model id. If the current ref resolves to no
 * agent it renders a **dangling** state (red) — the honest signal mirrored by validateSpec.
 */
export function AgentSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const agents = useWorkflowStore((s) => s.spec.agents)
  const current = agents.find((a) => a.id === value)
  const dangling = !current

  return (
    <span
      className={cn(
        'inline-flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[12.5px]',
        dangling && 'border-danger/55 bg-danger/10 text-danger',
      )}
      style={
        dangling
          ? undefined
          : {
              borderColor: `color-mix(in oklch, ${hueVar(current.model)} 42%, var(--color-line))`,
              background: `color-mix(in oklch, ${hueVar(current.model)} 14%, var(--color-well))`,
            }
      }
    >
      <span
        className="size-2 flex-none rounded-full"
        style={
          dangling
            ? { background: 'var(--color-danger)' }
            : { background: hueVar(current.model), boxShadow: `0 0 7px ${hueVar(current.model)}` }
        }
      />
      <select
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Phase agent"
      >
        {dangling && (
          <option value={value} disabled>
            «missing: {value || 'unset'}»
          </option>
        )}
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {current && <span className="ml-auto text-[10.5px] text-ink-faint">{shortModel(current.model)}</span>}
      <span className="text-ink-faint" aria-hidden>
        ▾
      </span>
    </span>
  )
}
