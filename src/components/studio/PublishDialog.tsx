import { useEffect, useRef, useState } from 'react'
import { Globe, Lock, Check, Copy } from 'lucide-react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useCloudStore } from '@/store/cloudStore'
import { useCopy } from '@/lib/useCopy'
import { renderTurnstile, removeTurnstile } from '@/lib/turnstile'
import { Modal, btnPrimary, btnGhost, btnDanger } from './Modal'

/** What the dialog is showing right now. */
type View =
  | { phase: 'saving' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; id: string; isPublic: boolean }

/**
 * "Share / publish…" — ensure the live workflow is in the cloud, then toggle its public flag.
 *
 * Opening the dialog first upserts the live spec (`saveToCloud`) so the share link always points
 * at the latest saved version and we have a stable id. Going *public* is gated on a Turnstile
 * token (the same human check the server enforces); going *private* asks nothing. When public,
 * the dialog surfaces the `${origin}/w/:id` link with a copy button. All state routes through
 * `cloudStore` — this component owns no persistence, only the widget lifecycle and view phase.
 *
 * Mounted only while active (the parent renders it on the `publish` dialog kind), so each open is
 * a fresh instance whose initial `saving` state needs no reset.
 */
export function PublishDialog({ onClose }: { onClose: () => void }) {
  const saveToCloud = useCloudStore((s) => s.saveToCloud)
  const setPublic = useCloudStore((s) => s.setPublic)

  const [view, setView] = useState<View>({ phase: 'saving' })
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // On mount, upsert the live spec to get a stable id + current public flag.
  useEffect(() => {
    let cancelled = false
    void saveToCloud(useWorkflowStore.getState().spec).then((res) => {
      if (cancelled) return
      setView(
        res.ok
          ? { phase: 'ready', id: res.meta.id, isPublic: res.meta.isPublic }
          : { phase: 'error', message: res.error },
      )
    })
    return () => {
      cancelled = true
    }
  }, [saveToCloud])

  const showWidget = view.phase === 'ready' && !view.isPublic

  // Render the Turnstile widget while the private→public gate is showing; tear it down on exit.
  const widgetRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!showWidget || !widgetRef.current) return
    let removed = false
    void renderTurnstile(widgetRef.current, {
      onToken: (t) => setToken(t),
      onExpire: () => setToken(null),
      onError: () => setToken(null),
    })
      .then((id) => {
        if (removed) removeTurnstile(id)
        else widgetIdRef.current = id
      })
      .catch(() => {
        /* leave Publish disabled; the server still gates on a valid token */
      })
    return () => {
      removed = true
      if (widgetIdRef.current) {
        removeTurnstile(widgetIdRef.current)
        widgetIdRef.current = null
      }
      setToken(null)
    }
  }, [showWidget])

  const shareUrl =
    view.phase === 'ready' ? `${location.origin}/w/${view.id}` : ''
  const [copied, copy] = useCopy()

  const doPublish = async () => {
    if (view.phase !== 'ready' || !token) return
    setBusy(true)
    setActionError(null)
    const res = await setPublic(view.id, true, token)
    setBusy(false)
    if (res.ok) {
      setView({ phase: 'ready', id: view.id, isPublic: true })
    } else {
      setToken(null) // Turnstile tokens are single-use — force a fresh challenge
      setActionError(res.error)
    }
  }

  const doMakePrivate = async () => {
    if (view.phase !== 'ready') return
    setBusy(true)
    setActionError(null)
    const res = await setPublic(view.id, false)
    setBusy(false)
    if (res.ok) setView({ phase: 'ready', id: view.id, isPublic: false })
    else setActionError(res.error)
  }

  const footer = renderFooter({
    view,
    busy,
    token,
    onClose,
    doPublish,
    doMakePrivate,
  })

  return (
    <Modal open onClose={onClose} title="Share / publish" footer={footer}>
      {view.phase === 'saving' && (
        <p className="font-mono text-[12px] leading-relaxed text-ink-dim">
          Saving to your cloud library…
        </p>
      )}

      {view.phase === 'error' && (
        <p className="font-mono text-[12px] leading-relaxed text-danger">
          {view.message}
        </p>
      )}

      {view.phase === 'ready' && view.isPublic && (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-mono text-[12px] text-ink">
            <Globe size={13} aria-hidden className="text-ink-dim" />
            This workflow is public. Anyone with the link can open it.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-rule bg-paper-2 px-2.5 py-2 font-mono text-[12px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
            />
            <button
              type="button"
              onClick={() => copy(shareUrl)}
              className={`${btnGhost} inline-flex shrink-0 items-center gap-1.5`}
            >
              {copied ? (
                <Check size={13} aria-hidden />
              ) : (
                <Copy size={13} aria-hidden />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-ink-faint">
            The link always shows the latest saved version.
          </p>
          {actionError && (
            <p className="font-mono text-[11px] text-danger">{actionError}</p>
          )}
        </div>
      )}

      {view.phase === 'ready' && !view.isPublic && (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-mono text-[12px] text-ink">
            <Lock size={13} aria-hidden className="text-ink-dim" />
            This workflow is private. Publish it to share a public link.
          </p>
          <div ref={widgetRef} data-testid="turnstile" />
          {actionError && (
            <p className="font-mono text-[11px] text-danger">{actionError}</p>
          )}
        </div>
      )}
    </Modal>
  )
}

/** The footer buttons depend on the phase and public flag; kept out of the body for clarity. */
function renderFooter({
  view,
  busy,
  token,
  onClose,
  doPublish,
  doMakePrivate,
}: {
  view: View
  busy: boolean
  token: string | null
  onClose: () => void
  doPublish: () => void
  doMakePrivate: () => void
}) {
  if (view.phase !== 'ready') {
    return (
      <button type="button" className={btnGhost} onClick={onClose}>
        {view.phase === 'error' ? 'Close' : 'Cancel'}
      </button>
    )
  }
  if (view.isPublic) {
    return (
      <>
        <button
          type="button"
          className={`${btnDanger} disabled:opacity-50`}
          disabled={busy}
          onClick={() => void doMakePrivate()}
        >
          Make private
        </button>
        <button type="button" className={btnPrimary} onClick={onClose}>
          Done
        </button>
      </>
    )
  }
  return (
    <>
      <button type="button" className={btnGhost} onClick={onClose}>
        Cancel
      </button>
      <button
        type="button"
        className={`${btnPrimary} disabled:opacity-50`}
        disabled={busy || !token}
        onClick={() => void doPublish()}
      >
        {busy ? 'Publishing…' : 'Publish'}
      </button>
    </>
  )
}
