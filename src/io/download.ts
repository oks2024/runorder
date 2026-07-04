/**
 * Browser file plumbing for save/export/import — the DOM side kept out of `persist.ts` so the
 * serializer stays a pure, jsdom-testable unit. Both helpers are thin wrappers over standard
 * browser APIs (Blob + `<a download>`, `<input type=file>` + FileReader); no dependencies.
 */

/** Trigger a client-side download of `text` as a file named `filename` (best-effort). */
export function downloadText(
  filename: string,
  text: string,
  mime = 'application/json',
): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on the next tick so the click has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Prompt the user to pick a file and resolve with its text. Resolves `null` when the picker is
 * dismissed without a selection (the file input's `cancel` event, supported by all evergreen
 * browsers; on older ones the promise never settles, so callers must not block on it).
 */
export function readFileText(
  accept = '.json,application/json',
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    input.addEventListener('cancel', () => {
      document.body.removeChild(input)
      resolve(null)
    })
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () =>
        resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () =>
        reject(reader.error ?? new Error('Failed to read file'))
      reader.readAsText(file)
    })
    document.body.appendChild(input)
    input.click()
  })
}
