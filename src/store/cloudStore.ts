/**
 * Cloud library — the signed-in user's server-stored workflows (the cloud twin of `libraryStore`).
 *
 * Deliberately *not* persisted: the server is the source of truth, so `refresh` re-reads the list
 * rather than trusting localStorage. Identity is the server `id` (not `spec.name`) — the backend
 * upserts by name, matching the local store's semantics, but exposes a stable id we key rows on.
 *
 * Opening a cloud workflow re-validates the server's spec client-side with `validateSpecValue`
 * (defense in depth — a compromised/older server response can't inject an invalid spec) and then
 * routes through `useWorkflowStore.load`, the single spec-replace seam shared with local open,
 * file import, and reseed. Every network method returns a result union rather than throwing, so
 * the menu can surface failures in its existing error modal.
 */
import { create } from 'zustand'
import { api, type CloudWorkflow, type CloudWorkflowMeta } from '@/api/client'
import type { WorkflowSpec } from '@/spec/schema'
import { validateSpecValue } from '@/io/persist'
import { track } from '@/api/analytics'
import { useWorkflowStore } from './workflowStore'

/** A save/open/publish outcome, surfaced to the menu (success or a human-readable error). */
type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export interface CloudState {
  items: CloudWorkflowMeta[]
  status: 'idle' | 'loading' | 'ready' | 'error'

  /** Reload the list from the server (signed-in only; failure ⇒ `status: 'error'`). */
  refresh: () => Promise<void>
  /** Upsert the live spec to the cloud; on success updates `items` from the returned meta. */
  saveToCloud: (
    spec: WorkflowSpec,
  ) => Promise<Outcome<{ meta: CloudWorkflowMeta }>>
  /** Fetch + re-validate a cloud workflow and load it into the live rundown. */
  openFromCloud: (id: string) => Promise<Outcome>
  /** Delete a cloud workflow; on success drops it from `items`. */
  remove: (id: string) => Promise<Outcome>
  /** Toggle a workflow's public visibility; on success updates its `isPublic` in `items`. */
  setPublic: (
    id: string,
    isPublic: boolean,
    turnstileToken?: string,
  ) => Promise<Outcome>
}

export const useCloudStore = create<CloudState>()((set) => ({
  items: [],
  status: 'idle',

  refresh: async () => {
    set({ status: 'loading' })
    const res = await api<{ workflows: CloudWorkflowMeta[] }>('/api/workflows')
    if (res.ok) {
      set({ items: res.data.workflows, status: 'ready' })
    } else {
      set({ status: 'error' })
    }
  },

  saveToCloud: async (spec) => {
    const res = await api<{ workflow: CloudWorkflowMeta }>('/api/workflows', {
      method: 'POST',
      body: { spec },
    })
    if (!res.ok) return { ok: false, error: res.error }
    const meta = res.data.workflow
    set((s) => ({ items: upsertMeta(s.items, meta) }))
    track('cloud_save')
    return { ok: true, meta }
  },

  openFromCloud: async (id) => {
    const res = await api<{ workflow: CloudWorkflow }>(`/api/workflows/${id}`)
    if (!res.ok) return { ok: false, error: res.error }
    // Defense in depth: trust the runtime seam, not the wire — re-run the full import pipeline.
    const validated = validateSpecValue(res.data.workflow.spec)
    if (!validated.ok) return { ok: false, error: validated.error }
    useWorkflowStore.getState().load(validated.spec)
    return { ok: true }
  },

  remove: async (id) => {
    const res = await api<void>(`/api/workflows/${id}`, { method: 'DELETE' })
    if (!res.ok) return { ok: false, error: res.error }
    set((s) => ({ items: s.items.filter((w) => w.id !== id) }))
    return { ok: true }
  },

  setPublic: async (id, isPublic, turnstileToken) => {
    const res = await api<{ workflow: { id: string; isPublic: boolean } }>(
      `/api/workflows/${id}/publish`,
      { method: 'POST', body: { public: isPublic, turnstileToken } },
    )
    if (!res.ok) return { ok: false, error: res.error }
    const updated = res.data.workflow
    set((s) => ({
      items: s.items.map((w) =>
        w.id === updated.id ? { ...w, isPublic: updated.isPublic } : w,
      ),
    }))
    if (updated.isPublic) track('workflow_publish')
    return { ok: true }
  },
}))

/** Replace-or-append a meta by id, preserving list order (new entries land at the end). */
function upsertMeta(
  items: CloudWorkflowMeta[],
  meta: CloudWorkflowMeta,
): CloudWorkflowMeta[] {
  const exists = items.some((w) => w.id === meta.id)
  return exists
    ? items.map((w) => (w.id === meta.id ? meta : w))
    : [...items, meta]
}
