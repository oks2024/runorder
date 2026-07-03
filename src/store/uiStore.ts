/**
 * Studio UI store — view-only state for the Studio redesign (never the spec model).
 *
 * Plain Zustand (no Immer — every field is a primitive or a shallow leaf; nothing nested
 * needs ergonomic patching). Holds which view is showing (worksheet vs. the read-only
 * rehearsal dry-run), the receipt column's open/tab state, drag-in-progress state for the
 * pattern shelf, the two-way provenance hover key, and the rehearsal sample size. The
 * workflow spec itself lives only in `useWorkflowStore` — this store is purely presentation.
 */
import { create } from 'zustand'
import type { PatternKey } from '@/lib/patterns'

const SAMPLE_N_MIN = 1
const SAMPLE_N_MAX = 99
const SAMPLE_N_DEFAULT = 12

function clampSampleN(n: number): number {
  if (!Number.isFinite(n)) return SAMPLE_N_DEFAULT
  return Math.max(SAMPLE_N_MIN, Math.min(SAMPLE_N_MAX, Math.round(n)))
}

export interface UiState {
  /** Worksheet (editable document) vs. rehearsal (read-only dry-run) top-bar switch. */
  view: 'worksheet' | 'rehearsal'
  /** Whether the receipt column (emitted-script/prompt pane) is open. */
  showScript: boolean
  /** Which tab the receipt column shows. */
  receiptTab: 'script' | 'prompt'
  /** The pattern currently being dragged from the shelf, if any (lights insertion seams). */
  draggingPattern: PatternKey | null
  /** The provenance key currently hovered (worksheet field or script line), for two-way hover. */
  provHover: string | null
  /** Rehearsal sample size (clamped 1..99). */
  sampleN: number

  setView: (v: UiState['view']) => void
  setShowScript: (b: boolean) => void
  setReceiptTab: (t: UiState['receiptTab']) => void
  setDragging: (k: PatternKey | null) => void
  setProvHover: (k: string | null) => void
  setSampleN: (n: number) => void
}

export const useUiStore = create<UiState>()((set) => ({
  view: 'worksheet',
  showScript: true,
  receiptTab: 'script',
  draggingPattern: null,
  provHover: null,
  sampleN: SAMPLE_N_DEFAULT,

  setView: (v) => set({ view: v }),
  setShowScript: (b) => set({ showScript: b }),
  setReceiptTab: (t) => set({ receiptTab: t }),
  setDragging: (k) => set({ draggingPattern: k }),
  setProvHover: (k) => set({ provHover: k }),
  setSampleN: (n) => set({ sampleN: clampSampleN(n) }),
}))
