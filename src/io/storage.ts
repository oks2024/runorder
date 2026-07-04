/**
 * localStorage plumbing shared by the persisted stores.
 *
 * Lives in `src/io` with the rest of the browser persistence boundary (`persist.ts` stays
 * DOM-free; this file is the storage side).
 */

/**
 * One-time key rename: move a value saved under an old brand's key to its new key.
 * Runs at store-module load, before Zustand `persist` hydrates. The new key wins if both
 * exist (the old one is stale by definition). Safe where storage is unavailable.
 */
export function migrateStorageKey(from: string, to: string): void {
  try {
    const old = localStorage.getItem(from)
    if (old !== null) {
      if (localStorage.getItem(to) === null) localStorage.setItem(to, old)
      localStorage.removeItem(from)
    }
  } catch {
    // storage unavailable (privacy mode, non-browser env) — nothing to migrate
  }
}
