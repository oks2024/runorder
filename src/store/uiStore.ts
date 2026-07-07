/**
 * Studio UI store — view-only state for the Studio redesign (never the spec model).
 *
 * Plain Zustand (no Immer — every field is a primitive or a shallow leaf; nothing nested
 * needs ergonomic patching). Holds which view is showing (rundown vs. the read-only
 * rehearsal dry-run), the prompt-book column's open/tab state, drag-in-progress state for the
 * pattern shelf, and the two-way provenance hover key. The workflow spec itself lives only in
 * `useWorkflowStore` — this store is purely presentation.
 */
import { create } from 'zustand'
import type { PatternKey } from '@/lib/patterns'

export interface UiState {
  /** Rundown (editable document) vs. rehearsal (read-only dry-run) top-bar switch. */
  view: 'rundown' | 'rehearsal'
  /** Whether the prompt-book column (emitted-script/prompt pane) is open. */
  showScript: boolean
  /** Which tab the prompt-book column shows. */
  promptBookTab: 'script' | 'prompt'
  /**
   * Which pane the single-pane mobile shell shows while `view === 'rundown'` — the document or
   * the full-screen prompt book. Only the bottom mode bar sets it; desktop (≥ md) ignores it
   * entirely (`showScript` keeps owning the side column there).
   */
  mobilePane: 'rundown' | 'script'
  /** The pattern currently being dragged from the shelf, if any (lights insertion seams). */
  draggingPattern: PatternKey | null
  /**
   * The rundown index the repertoire sheet is inserting at, or null when the sheet is closed.
   * Set by tapping/clicking a seam or the end slot — the touch-first path into `insertPattern`
   * (HTML5 drag-and-drop does not exist on touch).
   */
  insertAt: number | null
  /** The provenance key currently hovered (rundown field or script line), for two-way hover. */
  provHover: string | null

  setView: (v: UiState['view']) => void
  setShowScript: (b: boolean) => void
  setPromptBookTab: (t: UiState['promptBookTab']) => void
  setMobilePane: (p: UiState['mobilePane']) => void
  setDragging: (k: PatternKey | null) => void
  setInsertAt: (i: number | null) => void
  setProvHover: (k: string | null) => void
}

export const useUiStore = create<UiState>()((set) => ({
  view: 'rundown',
  showScript: true,
  promptBookTab: 'script',
  mobilePane: 'rundown',
  draggingPattern: null,
  insertAt: null,
  provHover: null,

  setView: (v) => set({ view: v }),
  setShowScript: (b) => set({ showScript: b }),
  setPromptBookTab: (t) => set({ promptBookTab: t }),
  setMobilePane: (p) => set({ mobilePane: p }),
  setDragging: (k) => set({ draggingPattern: k }),
  setInsertAt: (i) => set({ insertAt: i }),
  setProvHover: (k) => set({ provHover: k }),
}))
