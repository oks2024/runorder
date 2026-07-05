import type { RehearsalInstance } from '@/lib/rehearse'
import { InstanceCard } from './InstanceCard'

/**
 * The parallel-worker grid (mockup `.swarm`): auto-fill compact `InstanceCard`s. Clicking a
 * card selects it as the anatomy subject (`onSelect`).
 */
export function Swarm({
  instances,
  heroIndex,
  onSelect,
}: {
  instances: RehearsalInstance[]
  heroIndex: number | null
  onSelect: (index: number) => void
}) {
  return (
    <div
      className="grid gap-[7px]"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
    >
      {instances.map((inst, i) => (
        <InstanceCard
          key={i}
          instance={inst}
          compact
          isHero={heroIndex === i}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  )
}
