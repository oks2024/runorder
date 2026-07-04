/**
 * Named library — the local collection of saved workflows (localStorage-backed).
 *
 * Distinct from `useWorkflowStore`, which holds the single *live* worksheet. This store is the
 * hub for save/open/delete and the landing spot for imports: a workflow's identity is its
 * `spec.name`, which is the entry key here. Persisted under `playsheet.library` via Zustand's
 * bundled `persist` middleware (no Immer — updates replace the `entries` map wholesale).
 *
 * Opening an entry routes through `useWorkflowStore.load`, the single spec-replace seam, so the
 * live worksheet is always adopted (deep-cloned) the same way whether it comes from the library,
 * a file import, or a reseed. Specs are trusted on the way in: `save` is only called with a spec
 * that is already live-and-valid (from the store) or freshly `parseImport`-validated.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkflowSpec } from '@/spec/schema'
import { blankSpec, codeReviewLoop } from '@/spec/seed'
import { specsEqual } from '@/io/persist'
import { migrateStorageKey } from '@/io/storage'
import { useWorkflowStore } from './workflowStore'

export interface SavedEntry {
  spec: WorkflowSpec
  /** ISO timestamp of the last save (stamped by the caller — `Date` is fine in event handlers). */
  savedAt: string
}

export interface LibraryState {
  entries: Record<string, SavedEntry>

  /** Saved names, sorted alphabetically. */
  names: () => string[]
  has: (name: string) => boolean
  /** Upsert the spec under its own `spec.name` (deep-cloned; `savedAt` stamped now). */
  save: (spec: WorkflowSpec) => void
  /** Load a saved entry into the live worksheet; no-op if the name is unknown. */
  open: (name: string) => void
  remove: (name: string) => void
  /**
   * Would replacing the live worksheet lose work? True when `spec` differs from its library
   * entry — or, if it was never saved, from the untouched seed/blank starting points.
   */
  isDirty: (spec: WorkflowSpec) => boolean
}

migrateStorageKey('prewire.library', 'playsheet.library')

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      entries: {},

      names: () =>
        Object.keys(get().entries).sort((a, b) => a.localeCompare(b)),

      has: (name) => name in get().entries,

      save: (spec) =>
        set((s) => ({
          entries: {
            ...s.entries,
            [spec.name]: {
              spec: structuredClone(spec),
              savedAt: new Date().toISOString(),
            },
          },
        })),

      open: (name) => {
        const entry = get().entries[name]
        if (entry) useWorkflowStore.getState().load(entry.spec)
      },

      remove: (name) =>
        set((s) => {
          const next = { ...s.entries }
          delete next[name]
          return { entries: next }
        }),

      isDirty: (spec) => {
        const entry = get().entries[spec.name]
        if (entry) return !specsEqual(entry.spec, spec)
        return (
          !specsEqual(spec, codeReviewLoop) && !specsEqual(spec, blankSpec())
        )
      },
    }),
    {
      name: 'playsheet.library',
      version: 1,
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
)
