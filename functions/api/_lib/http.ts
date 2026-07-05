/**
 * JSON response helpers shared by every API handler.
 *
 * The API is an authenticated, user-specific surface, so every response is `Cache-Control:
 * no-store` — nothing here is ever safe to cache in a shared proxy or the browser. Both
 * helpers set `content-type: application/json`; callers pass only the data and status.
 */

/** A JSON `Response` with `no-store`. Extra headers merge over (but never drop) the defaults. */
export function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'Cache-Control': 'no-store',
      ...headersToObject(headers),
    },
  })
}

/** A JSON error envelope `{ error: message }` at the given status. */
export function errorJson(message: string, status: number): Response {
  return json({ error: message }, status)
}

/** Normalize a `HeadersInit` (array / Headers / record) into a plain object for spreading. */
function headersToObject(init?: HeadersInit): Record<string, string> {
  if (!init) return {}
  const out: Record<string, string> = {}
  new Headers(init).forEach((value, key) => {
    out[key] = value
  })
  return out
}
