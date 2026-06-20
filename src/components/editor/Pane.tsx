import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared pane chrome (mockup-7 `.pane`): code label + title + optional header extra. */
export function Pane({
  code,
  title,
  headerExtra,
  bodyClassName,
  children,
}: {
  code: string
  title: string
  headerExtra?: ReactNode
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-panel shadow-[0_8px_22px_oklch(0_0_0/0.28)]">
      <div className="flex items-center gap-2 border-b border-line-soft px-3.5 py-2.5">
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-ink-faint uppercase">
          {code}
        </span>
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="flex-1" />
        {headerExtra}
      </div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto p-3', bodyClassName)}>{children}</div>
    </section>
  )
}
