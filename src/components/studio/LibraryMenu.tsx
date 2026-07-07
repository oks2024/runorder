import { useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import {
  FolderOpen,
  Save,
  FilePlus2,
  CopyPlus,
  Download,
  Upload,
  Trash2,
  ChevronDown,
  CloudUpload,
  Share2,
  Globe,
  Lock,
  LogIn,
} from 'lucide-react'
import { useWorkflowStore } from '@/store/workflowStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useAuthStore } from '@/store/authStore'
import { useCloudStore } from '@/store/cloudStore'
import { blankSpec } from '@/spec/seed'
import { serializeSpec, specFilename, parseImport } from '@/io/persist'
import { downloadText, readFileText } from '@/io/download'
import { track } from '@/api/analytics'
import { Modal, btnPrimary, btnGhost, btnDanger } from './Modal'
import { PublishDialog } from './PublishDialog'

/** Which modal (if any) is open, and the data it needs. */
type DialogState =
  | { kind: 'saveAs'; name: string }
  | {
      kind: 'confirm'
      message: string
      confirmLabel: string
      danger?: boolean
      onConfirm: () => void
    }
  | { kind: 'error'; message: string; title?: string }
  | { kind: 'manage' }
  | { kind: 'publish' }
  | null

/**
 * The save/export/import hub in the top bar (mockup neighbor of "Copy script"). A single dropdown
 * over the named library (`libraryStore`) plus JSON file I/O; all spec replacement routes through
 * `useWorkflowStore.load` via `library.open`. Overwrite / import-update / delete are confirmed in
 * a modal (Studio paper theme), and import failures surface their `parseImport` error message.
 */
export function LibraryMenu() {
  const spec = useWorkflowStore((s) => s.spec)
  const setName = useWorkflowStore((s) => s.setName)
  const load = useWorkflowStore((s) => s.load)
  const entries = useLibraryStore((s) => s.entries)
  const save = useLibraryStore((s) => s.save)
  const open = useLibraryStore((s) => s.open)
  const remove = useLibraryStore((s) => s.remove)
  const isDirty = useLibraryStore((s) => s.isDirty)

  const signedIn = useAuthStore((s) => s.user != null)
  const signIn = useAuthStore((s) => s.signIn)
  const cloudItems = useCloudStore((s) => s.items)
  const saveToCloud = useCloudStore((s) => s.saveToCloud)
  const openFromCloud = useCloudStore((s) => s.openFromCloud)
  const removeFromCloud = useCloudStore((s) => s.remove)

  const [dialog, setDialog] = useState<DialogState>(null)
  const names = Object.keys(entries).sort((a, b) => a.localeCompare(b))

  /** The unsaved-changes warning, when replacing the live rundown would lose work. */
  const dirtyWarning = () =>
    isDirty(spec)
      ? `The rundown “${spec.name}” has unsaved changes that will be lost.`
      : null

  /** Run `action` immediately, or behind a discard confirmation if the live doc is dirty. */
  const guardUnsaved = (confirmLabel: string, action: () => void) => {
    const warning = dirtyWarning()
    if (warning) {
      setDialog({
        kind: 'confirm',
        message: warning,
        confirmLabel,
        danger: true,
        onConfirm: action,
      })
    } else {
      action()
    }
  }

  // --- actions ---

  const doNew = () => guardUnsaved('Discard & create', () => load(blankSpec()))

  const doOpen = (name: string) =>
    guardUnsaved('Discard & open', () => open(name))

  const doExport = () => {
    downloadText(specFilename(spec), serializeSpec(spec))
    track('workflow_export')
  }

  const doImport = async () => {
    let text: string | null
    try {
      text = await readFileText()
    } catch {
      setDialog({ kind: 'error', message: 'Could not read the selected file.' })
      return
    }
    if (text == null) return // cancelled
    const result = parseImport(text)
    if (!result.ok) {
      setDialog({ kind: 'error', message: result.error })
      return
    }
    const imported = result.spec
    const land = () => {
      save(imported)
      open(imported.name)
    }
    // One combined confirmation: losing unsaved live work and/or updating an existing entry.
    const dirty = dirtyWarning()
    const collision = imported.name in entries
    const warnings = [
      dirty,
      collision
        ? `A saved workflow named “${imported.name}” already exists. Importing will update it with the file's contents.`
        : null,
    ].filter((w): w is string => w != null)
    if (warnings.length > 0) {
      setDialog({
        kind: 'confirm',
        message: warnings.join(' '),
        confirmLabel: collision ? 'Update' : 'Discard & import',
        danger: dirty != null,
        onConfirm: land,
      })
    } else {
      land()
    }
  }

  const submitSaveAs = (rawName: string) => {
    const name = rawName.trim()
    if (!name) return
    const commit = () => {
      setName(name) // the live doc becomes the new name…
      save({ ...spec, name }) // …and is saved under it
      setDialog(null)
    }
    if (name !== spec.name && name in entries) {
      setDialog({
        kind: 'confirm',
        message: `A saved workflow named “${name}” already exists. Save As will overwrite it.`,
        confirmLabel: 'Overwrite',
        onConfirm: commit,
      })
    } else {
      commit()
    }
  }

  // --- cloud actions ---

  /** Open a cloud workflow into the live rundown, guarding unsaved work; errors → error modal. */
  const doOpenCloud = (id: string) =>
    guardUnsaved('Discard & open', async () => {
      const result = await openFromCloud(id)
      if (!result.ok) {
        setDialog({
          kind: 'error',
          title: 'Could not open',
          message: result.error,
        })
      }
    })

  /** Upsert the live spec to the cloud (server upserts by name — no collision confirm). */
  const doSaveToCloud = async () => {
    const result = await saveToCloud(spec)
    if (!result.ok) {
      setDialog({
        kind: 'error',
        title: 'Could not save to cloud',
        message: result.error,
      })
    }
  }

  /** Delete a cloud workflow after a confirmation; errors → error modal. */
  const confirmRemoveCloud = (id: string, name: string) =>
    setDialog({
      kind: 'confirm',
      message: `Delete the cloud workflow “${name}”? This removes it from your account and cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const result = await removeFromCloud(id)
        if (!result.ok) {
          setDialog({
            kind: 'error',
            title: 'Could not delete',
            message: result.error,
          })
        }
      },
    })

  // --- render ---

  return (
    <>
      <Menu.Root>
        <Menu.Trigger className="inline-flex items-center gap-2 rounded-lg border border-rule px-3 py-1.5 font-mono text-[11px] text-ink-dim outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
          <FolderOpen size={13} aria-hidden />
          Saved
          <ChevronDown size={12} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-30">
            <Menu.Popup className="min-w-[220px] rounded-[10px] border border-rule bg-paper-2 p-1.5 font-mono text-[12px] text-ink shadow-[0_14px_32px_oklch(0_0_0/0.14)] outline-none">
              <MenuAction
                icon={<FilePlus2 size={13} />}
                label="New workflow"
                onClick={doNew}
              />

              <Menu.Separator className="my-1.5 h-px bg-rule-soft" />

              <div className="px-2 py-1 text-[10px] tracking-[0.14em] text-ink-faint uppercase">
                Open
              </div>
              {names.length === 0 ? (
                <div className="px-2 py-1.5 text-[11px] text-ink-faint italic">
                  No saved workflows
                </div>
              ) : (
                names.map((name) => (
                  <Menu.Item
                    key={name}
                    onClick={() => doOpen(name)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 data-highlighted:bg-paper-3"
                  >
                    <span className="truncate">{name}</span>
                    {name === spec.name && (
                      <span className="ml-auto text-[10px] text-ink-faint">
                        current
                      </span>
                    )}
                  </Menu.Item>
                ))
              )}

              <Menu.Separator className="my-1.5 h-px bg-rule-soft" />

              {signedIn ? (
                <>
                  <div className="px-2 py-1 text-[10px] tracking-[0.14em] text-ink-faint uppercase">
                    Cloud
                  </div>
                  {cloudItems.length === 0 ? (
                    <div className="px-2 py-1.5 text-[11px] text-ink-faint italic">
                      No cloud workflows
                    </div>
                  ) : (
                    cloudItems.map((item) => (
                      <Menu.Item
                        key={item.id}
                        onClick={() => doOpenCloud(item.id)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 data-highlighted:bg-paper-3"
                      >
                        <span className="text-ink-faint" aria-hidden>
                          {item.isPublic ? (
                            <Globe size={12} />
                          ) : (
                            <Lock size={12} />
                          )}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </Menu.Item>
                    ))
                  )}
                  <MenuAction
                    icon={<CloudUpload size={13} />}
                    label="Save to cloud"
                    onClick={doSaveToCloud}
                  />
                  <MenuAction
                    icon={<Share2 size={13} />}
                    label="Share / publish…"
                    onClick={() => setDialog({ kind: 'publish' })}
                  />
                </>
              ) : (
                <MenuAction
                  icon={<LogIn size={13} />}
                  label="Sign in to sync"
                  onClick={signIn}
                />
              )}

              <Menu.Separator className="my-1.5 h-px bg-rule-soft" />

              <MenuAction
                icon={<Save size={13} />}
                label="Save"
                onClick={() => save(spec)}
              />
              <MenuAction
                icon={<CopyPlus size={13} />}
                label="Save as…"
                onClick={() => setDialog({ kind: 'saveAs', name: spec.name })}
              />

              <Menu.Separator className="my-1.5 h-px bg-rule-soft" />

              <MenuAction
                icon={<Download size={13} />}
                label="Export JSON…"
                onClick={doExport}
              />
              <MenuAction
                icon={<Upload size={13} />}
                label="Import JSON…"
                onClick={doImport}
              />

              {(names.length > 0 ||
                (signedIn && cloudItems.length > 0)) && (
                <>
                  <Menu.Separator className="my-1.5 h-px bg-rule-soft" />
                  <MenuAction
                    icon={<Trash2 size={13} />}
                    label="Manage saved…"
                    onClick={() => setDialog({ kind: 'manage' })}
                  />
                </>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* Save-as name entry */}
      <Modal
        open={dialog?.kind === 'saveAs'}
        onClose={() => setDialog(null)}
        title="Save as"
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
              className={btnPrimary}
              onClick={() =>
                dialog?.kind === 'saveAs' && submitSaveAs(dialog.name)
              }
            >
              Save
            </button>
          </>
        }
      >
        {dialog?.kind === 'saveAs' && (
          <input
            autoFocus
            value={dialog.name}
            onChange={(e) =>
              setDialog({ kind: 'saveAs', name: e.target.value })
            }
            onKeyDown={(e) => e.key === 'Enter' && submitSaveAs(dialog.name)}
            placeholder="workflow name"
            className="w-full rounded-md border border-rule bg-paper px-2.5 py-2 font-mono text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
          />
        )}
      </Modal>

      {/* Overwrite / import-update confirmation */}
      <Modal
        open={dialog?.kind === 'confirm'}
        onClose={() => setDialog(null)}
        title="Please confirm"
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
              className={
                dialog?.kind === 'confirm' && dialog.danger
                  ? btnDanger
                  : btnPrimary
              }
              onClick={() => {
                if (dialog?.kind === 'confirm') {
                  // Close first so an onConfirm that opens another dialog isn't clobbered.
                  setDialog(null)
                  dialog.onConfirm()
                }
              }}
            >
              {dialog?.kind === 'confirm' ? dialog.confirmLabel : 'Confirm'}
            </button>
          </>
        }
      >
        {dialog?.kind === 'confirm' && (
          <p className="font-mono text-[12px] leading-relaxed text-ink-dim">
            {dialog.message}
          </p>
        )}
      </Modal>

      {/* Import error */}
      <Modal
        open={dialog?.kind === 'error'}
        onClose={() => setDialog(null)}
        title={(dialog?.kind === 'error' && dialog.title) || 'Import failed'}
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

      {/* Manage saved workflows (delete) */}
      <Modal
        open={dialog?.kind === 'manage'}
        onClose={() => setDialog(null)}
        title="Saved workflows"
        footer={
          <button
            type="button"
            className={btnGhost}
            onClick={() => setDialog(null)}
          >
            Close
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {names.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="px-0.5 py-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">
                Local
              </div>
              {names.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-md border border-rule-soft px-2.5 py-2"
                >
                  <span className="truncate font-mono text-[12px] text-ink">
                    {name}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-faint">
                    {formatSavedAt(entries[name].savedAt)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${name}`}
                    className="rounded p-1 text-ink-faint hover:text-danger"
                    onClick={() =>
                      setDialog({
                        kind: 'confirm',
                        message: `Delete the saved workflow “${name}”? This cannot be undone.`,
                        confirmLabel: 'Delete',
                        danger: true,
                        onConfirm: () => remove(name),
                      })
                    }
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}

          {signedIn && cloudItems.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="px-0.5 py-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">
                Cloud
              </div>
              {cloudItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md border border-rule-soft px-2.5 py-2"
                >
                  <span className="shrink-0 text-ink-faint" aria-hidden>
                    {item.isPublic ? <Globe size={12} /> : <Lock size={12} />}
                  </span>
                  <span className="truncate font-mono text-[12px] text-ink">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${item.name} from cloud`}
                    className="ml-auto rounded p-1 text-ink-faint hover:text-danger"
                    onClick={() => confirmRemoveCloud(item.id, item.name)}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Share / publish (signed-in cloud action) — mounted only while active */}
      {dialog?.kind === 'publish' && (
        <PublishDialog onClose={() => setDialog(null)} />
      )}
    </>
  )
}

/** Compact save timestamp for the Manage dialog, e.g. "Jul 3, 2026, 9:14 PM". */
function formatSavedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** A menu action row (icon + label). Base UI `Menu.Item` handles keyboard nav + close-on-click. */
function MenuAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Menu.Item
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 data-highlighted:bg-paper-3"
    >
      <span className="text-ink-dim" aria-hidden>
        {icon}
      </span>
      {label}
    </Menu.Item>
  )
}
