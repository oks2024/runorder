import { useEffect, useState } from 'react'
import { api, type CloudWorkflow } from '@/api/client'
import { validateSpecValue } from '@/io/persist'
import { useWorkflowStore } from '@/store/workflowStore'
import { useLibraryStore } from '@/store/libraryStore'
import { Modal, btnPrimary, btnGhost, btnDanger } from './Modal'

/** A share id is a 6–16 char base62 slug in the `/w/:id` path. */
const SHARE_PATH = /^\/w\/([0-9A-Za-z]{6,16})$/

/** Extract the share id from a pathname, or `null` if it isn't a `/w/:id` link. */
function matchShareId(pathname: string): string | null {
  return SHARE_PATH.exec(pathname)?.[1] ?? null
}

type Dialog =
  | { kind: 'error'; message: string }
  | { kind: 'confirm'; name: string; onConfirm: () => void }
  | null

/**
 * Boot-time handler for `runorder.dev/w/:id` share links (no router — the app is a single view).
 *
 * On mount it inspects `location.pathname`; a `/w/:id` match is fetched from the public read
 * endpoint (world-readable when the workflow is public, 404 otherwise — no existence leak). The
 * URL is rewritten to `/` immediately, before any await, so a StrictMode double-invoke and a page
 * refresh don't re-trigger the load. The spec is re-validated client-side (defense in depth), and
 * if the live rundown has unsaved work the swap is held behind a discard confirmation — mirroring
 * the LibraryMenu open flow. Renders only its (usually closed) modals.
 */
export function ShareLinkLoader() {
  const [dialog, setDialog] = useState<Dialog>(null)

  useEffect(() => {
    const id = matchShareId(location.pathname)
    if (!id) return
    // Rewrite synchronously (before the first await) so refresh / StrictMode can't re-fire.
    history.replaceState({}, '', '/')
    void handleShareLink(id, setDialog)
  }, [])

  return (
    <>
      <Modal
        open={dialog?.kind === 'error'}
        onClose={() => setDialog(null)}
        title="Could not open link"
        footer={
          <button
            type="button"
            className={btnPrimary}
            onClick={() => setDialog(null)}
          >
            OK
          </button>
        }
      >
        {dialog?.kind === 'error' && (
          <p className="font-mono text-[12px] leading-relaxed text-danger">
            {dialog.message}
          </p>
        )}
      </Modal>

      <Modal
        open={dialog?.kind === 'confirm'}
        onClose={() => setDialog(null)}
        title="Open shared workflow"
        footer={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setDialog(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={btnDanger}
              onClick={() => {
                if (dialog?.kind === 'confirm') {
                  setDialog(null)
                  dialog.onConfirm()
                }
              }}
            >
              Discard & open
            </button>
          </>
        }
      >
        {dialog?.kind === 'confirm' && (
          <p className="font-mono text-[12px] leading-relaxed text-ink-dim">
            Opening the shared workflow “{dialog.name}” will replace your
            current rundown, which has unsaved changes.
          </p>
        )}
      </Modal>
    </>
  )
}

/** Fetch, validate, and load a shared workflow — guarding unsaved live work first. */
async function handleShareLink(
  id: string,
  setDialog: (d: Dialog) => void,
): Promise<void> {
  const res = await api<{ workflow: CloudWorkflow }>(`/api/workflows/${id}`)
  if (!res.ok) {
    setDialog({
      kind: 'error',
      message:
        res.status === 404
          ? 'This shared workflow doesn’t exist or is no longer public.'
          : res.error,
    })
    return
  }

  // Defense in depth: re-run the same validation the import path uses before touching the doc.
  const validated = validateSpecValue(res.data.workflow.spec)
  if (!validated.ok) {
    setDialog({ kind: 'error', message: validated.error })
    return
  }
  const spec = validated.spec
  const load = () => useWorkflowStore.getState().load(spec)

  const live = useWorkflowStore.getState().spec
  if (useLibraryStore.getState().isDirty(live)) {
    setDialog({
      kind: 'confirm',
      name: res.data.workflow.name,
      onConfirm: load,
    })
  } else {
    load()
  }
}
