import type { ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'

/**
 * Minimal controlled modal on Base UI `Dialog`, styled in the Studio paper theme. Used by the
 * library menu for Save-as name entry, overwrite/delete/import confirmations, and import errors.
 * Purely presentational — the caller owns `open`, the footer buttons, and all actions.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/25" />
        <Dialog.Popup className="fixed left-1/2 top-1/3 z-50 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-rule bg-paper p-5 shadow-[0_20px_48px_oklch(0_0_0/0.18)] outline-none">
          <Dialog.Title className="mb-3 font-mono text-[13px] font-semibold text-ink">
            {title}
          </Dialog.Title>
          {children}
          {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Shared button styles for modal footers (and the menu), in the paper token language. */
export const btnBase =
  'rounded-lg px-3.5 py-1.5 font-mono text-[12px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus'
export const btnPrimary = `${btnBase} border border-ink bg-ink text-paper`
export const btnGhost = `${btnBase} border border-rule text-ink-dim hover:text-ink`
export const btnDanger = `${btnBase} border border-danger bg-danger text-paper`
