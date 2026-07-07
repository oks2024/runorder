/**
 * Pure helpers behind the analytics ingest (`POST /api/events`), kept out of the handler so
 * they stay deterministic and node-testable — no request, no clock, no DB.
 *
 * Privacy is the design constraint, not a feature bolted on. The client sends no identifier;
 * uniqueness is reconstructed server-side as a *daily-rotating* hash of coarse signals
 * (`visitorHash`), which resets every UTC day and cannot be reversed to an IP or linked across
 * days. Event metadata is aggressively clamped (`sanitizeProps`) so a hostile or buggy client
 * can't turn the events table into free-form storage or a PII sink.
 */
import { z } from 'zod'

/** Hard ceiling on an incoming event's raw JSON body, in bytes (rejected before parse). */
export const MAX_EVENT_BYTES = 4 * 1024

/** Max metadata keys kept from `props`; extras are dropped. */
const MAX_PROP_KEYS = 12
/** Max length of a string prop value or the `path`; longer is truncated. */
const MAX_STR_LEN = 200

/**
 * Event names are validated by *shape*, not an allowlist — so the client can add events without
 * a coupled server deploy. Lowercase snake_case, 1–40 chars, must start with a letter.
 */
const EVENT_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/

/** The wire shape of a tracked event. Names/paths/props are further clamped post-parse. */
export const eventInputSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  props: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
})

export type EventInput = z.infer<typeof eventInputSchema>

/** A validated, clamped event ready to persist. `path`/`props` are already normalized. */
export interface CleanEvent {
  name: string
  path: string | null
  props: string | null
}

/**
 * Validate + clamp a parsed request body into a `CleanEvent`, or return a readable error.
 * Never throws. Unknown-shaped bodies and bad names are rejected; oversized/rich `props` are
 * trimmed rather than rejected, so a slightly-too-eager client still records the core event.
 */
export function cleanEvent(
  value: unknown,
): { ok: true; event: CleanEvent } | { ok: false; error: string } {
  const parsed = eventInputSchema.safeParse(value)
  if (!parsed.success) return { ok: false, error: 'Malformed event.' }

  const name = parsed.data.name
  if (!EVENT_NAME_RE.test(name)) return { ok: false, error: 'Bad event name.' }

  return {
    ok: true,
    event: {
      name,
      path: parsed.data.path ? truncate(parsed.data.path) : null,
      props: sanitizeProps(parsed.data.props),
    },
  }
}

/** Truncate a string to `MAX_STR_LEN` characters. */
function truncate(value: string): string {
  return value.length > MAX_STR_LEN ? value.slice(0, MAX_STR_LEN) : value
}

/**
 * Reduce arbitrary props to a small, safe JSON string (or `null` when empty). Keeps at most
 * `MAX_PROP_KEYS` entries; string values are truncated; numbers must be finite; everything
 * else is dropped. The output is what lands in the `events.props` column.
 */
export function sanitizeProps(
  props: Record<string, string | number | boolean> | undefined,
): string | null {
  if (!props) return null
  const out: Record<string, string | number | boolean> = {}
  let kept = 0
  for (const [key, raw] of Object.entries(props)) {
    if (kept >= MAX_PROP_KEYS) break
    if (typeof raw === 'string') out[truncate(key)] = truncate(raw)
    else if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) continue
      out[truncate(key)] = raw
    } else if (typeof raw === 'boolean') out[truncate(key)] = raw
    else continue
    kept++
  }
  return kept === 0 ? null : JSON.stringify(out)
}

/** The UTC day stamp (`YYYY-MM-DD`) for an epoch-ms instant — the rotation key for `visitor`. */
export function dayStamp(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

/**
 * Derive the daily-rotating anonymous visitor id.
 *
 * `SHA-256(ip | ua | day | secret)` → short hex. The `day` term makes it reset every UTC day;
 * the `secret` (reused from `SESSION_SECRET`) means the digest can't be recomputed by anyone
 * who only knows the IP/UA. Truncated to 16 hex chars — plenty for daily-unique counting,
 * deliberately lossy so it isn't a durable fingerprint.
 */
export async function visitorHash(
  ip: string,
  ua: string,
  day: string,
  secret: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${ip}|${ua}|${day}|${secret}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex.slice(0, 16)
}
