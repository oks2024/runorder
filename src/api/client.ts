/**
 * Thin same-origin fetch wrapper for the Runorder cloud backend (`/api/*`).
 *
 * Mirrors `parseImport`'s result-union philosophy: this helper *never throws*. Every call
 * resolves to an `ApiResult<T>` — `{ ok: true, data }` on 2xx, or `{ ok: false, status, error }`
 * on a non-2xx response (best-effort `{ error }` body) or a network failure (`status: 0`). Callers
 * branch on `ok` instead of wrapping fetch in try/catch, so the stores and UI stay linear.
 *
 * Session is a first-party cookie, so every request carries `credentials: 'same-origin'`. Bodies
 * are JSON in / JSON out; a 204 (logout, delete) resolves with `undefined` typed as `T` — helpers
 * that hit those endpoints type themselves as `api<void>(…)`.
 */
import type { WorkflowSpec } from '@/spec/schema'

/** The authenticated user, as returned by `/api/me` and embedded elsewhere. */
export interface ApiUser {
  login: string
  name: string | null
  avatarUrl: string | null
}

/** A cloud workflow's list/summary shape (no spec body). */
export interface CloudWorkflowMeta {
  id: string
  name: string
  isPublic: boolean
  updatedAt: string
}

/** A cloud workflow with its full spec (from `GET /api/workflows/:id`). */
export interface CloudWorkflow extends CloudWorkflowMeta {
  spec: WorkflowSpec
}

/** Result union for every API call — never thrown, always returned. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const NETWORK_ERROR = 'Network error.'

/**
 * Perform a same-origin JSON request and fold the outcome into an `ApiResult<T>`.
 *
 * `body`, when present, is JSON-encoded with a `Content-Type: application/json` header. A 204
 * (or otherwise empty) response resolves as `{ ok: true, data: undefined }`; a non-2xx response
 * is parsed for a `{ error }` field, falling back to a generic message; a thrown fetch (offline,
 * DNS, CORS) becomes `{ ok: false, status: 0, error: 'Network error.' }`.
 */
export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers:
        init?.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR }
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: await readError(res) }
  }

  return { ok: true, data: await readData<T>(res) }
}

/** Best-effort `{ error }` extraction from a failed response; falls back to a generic message. */
async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as unknown
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
    ) {
      return (body as { error: string }).error
    }
  } catch {
    // fall through to the generic message
  }
  return GENERIC_ERROR
}

/** Parse a successful body as JSON; a 204/empty body resolves to `undefined` typed as `T`. */
async function readData<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}
