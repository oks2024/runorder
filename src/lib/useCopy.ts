import { useCallback, useRef, useState } from 'react'

/** Copy-to-clipboard with a transient "copied" flag (with execCommand fallback). */
export function useCopy(resetMs = 1600): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(
    (text: string) => {
      const done = () => {
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), resetMs)
      }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallback(text, done))
      } else {
        fallback(text, done)
      }
    },
    [resetMs],
  )

  return [copied, copy]
}

function fallback(text: string, done: () => void) {
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta)
  done()
}
