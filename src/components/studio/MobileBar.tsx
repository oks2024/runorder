import { useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

type Mode = 'rundown' | 'script' | 'rehearsal'

const MODES: Array<{ mode: Mode; label: string }> = [
  { mode: 'rundown', label: 'Rundown' },
  { mode: 'script', label: 'Script' },
  { mode: 'rehearsal', label: 'Rehearse' },
]

/**
 * The mobile mode bar (`md:hidden`): the document's footer rule made tappable. On a phone the
 * desktop's three surfaces (rundown document, prompt-book column, rehearsal view) become three
 * full-screen modes switched here, thumb-reachable, replacing the top bar's view tabs and
 * Script toggle. Script maps to `mobilePane` (desktop's `showScript` is untouched); Rehearse
 * maps to the shared `view`, so rotating a phone mid-rehearsal stays in rehearsal.
 */
export function MobileBar() {
  const view = useUiStore((s) => s.view)
  const mobilePane = useUiStore((s) => s.mobilePane)
  const setView = useUiStore((s) => s.setView)
  const setMobilePane = useUiStore((s) => s.setMobilePane)

  const active: Mode = view === 'rehearsal' ? 'rehearsal' : mobilePane

  const select = (mode: Mode) => {
    if (mode === 'rehearsal') {
      setView('rehearsal')
    } else {
      setView('rundown')
      setMobilePane(mode)
    }
  }

  return (
    <nav
      aria-label="View"
      className="grid grid-cols-3 border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MODES.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          aria-current={active === mode ? 'true' : undefined}
          onClick={() => select(mode)}
          className={cn(
            'py-3 font-mono text-[11px] tracking-[0.14em] uppercase outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
            active === mode ? 'bg-ink font-medium text-paper' : 'text-ink-dim',
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
