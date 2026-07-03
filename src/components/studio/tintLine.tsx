import type { ReactNode } from 'react'

/**
 * Tiny deterministic syntax tint for one emitted script line (mockup `.eline .kw/.str/.cm`) —
 * no library, just a character scan that tracks single/double-quote string state so a `//`
 * INSIDE a string literal (e.g. a URL) is never mistaken for a comment. Keywords are tagged
 * only in the leftover plain text, so a keyword-looking substring inside a string or comment
 * is never re-tinted.
 */
export interface TintSeg {
  kind: 'plain' | 'kw' | 'str' | 'cm'
  text: string
}

const KEYWORD_RE = /=>|\b(?:export|const|await|return|function|for|let|if)\b/g

/** Split a plain (non-string, non-comment) run into keyword / non-keyword segments. */
function tagKeywords(buf: string, out: TintSeg[]): void {
  if (!buf) return
  KEYWORD_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = KEYWORD_RE.exec(buf))) {
    if (m.index > last) out.push({ kind: 'plain', text: buf.slice(last, m.index) })
    out.push({ kind: 'kw', text: m[0] })
    last = m.index + m[0].length
  }
  if (last < buf.length) out.push({ kind: 'plain', text: buf.slice(last) })
}

/** Pure tokenizer: text → typed segments. Exported directly so it's unit-testable without
 *  rendering. */
export function tintSegments(text: string): TintSeg[] {
  const segs: TintSeg[] = []
  let i = 0
  let buf = ''
  let quote: '"' | "'" | null = null

  while (i < text.length) {
    const c = text[i]
    if (quote) {
      buf += c
      if (c === '\\' && i + 1 < text.length) {
        buf += text[i + 1]
        i += 2
        continue
      }
      if (c === quote) {
        segs.push({ kind: 'str', text: buf })
        buf = ''
        quote = null
      }
      i++
      continue
    }
    if (c === '"' || c === "'") {
      tagKeywords(buf, segs)
      buf = c
      quote = c
      i++
      continue
    }
    if (c === '/' && text[i + 1] === '/') {
      tagKeywords(buf, segs)
      segs.push({ kind: 'cm', text: text.slice(i) })
      buf = ''
      break
    }
    buf += c
    i++
  }
  if (quote) {
    // Unterminated string literal (shouldn't happen in valid emitted JS, but never crash the
    // receipt column over it) — treat whatever's left as string content.
    if (buf) segs.push({ kind: 'str', text: buf })
  } else {
    tagKeywords(buf, segs)
  }
  return segs
}

const CLASS: Record<TintSeg['kind'], string | undefined> = {
  plain: undefined,
  kw: 'text-sonnet font-medium',
  str: 'text-haiku',
  cm: 'text-ink-faint',
}

/** Render a script line with keyword/string/comment tint. */
export function tintLine(text: string): ReactNode {
  return tintSegments(text).map((seg, i) =>
    CLASS[seg.kind] ? (
      <span key={i} className={CLASS[seg.kind]}>
        {seg.text}
      </span>
    ) : (
      <span key={i}>{seg.text}</span>
    ),
  )
}
