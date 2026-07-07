/**
 * Auth store — the signed-in user (or `null`), fetched from `/api/me`.
 *
 * Plain Zustand, deliberately *not* persisted (like `uiStore`): the session lives in a cookie and
 * the server is the source of truth, so we re-derive the user on every load via `fetchMe`. The
 * app never blocks on auth — a failed `fetchMe` simply lands on `{ user: null, status: 'ready' }`,
 * so the whole cloud surface degrades to signed-out rather than erroring.
 *
 * `signIn` is a full-page redirect to the OAuth start endpoint (not a fetch), routed through the
 * `navigate` indirection so tests can spy on it without jsdom's navigation error. `returnTo`
 * carries the current path so the user lands back where they were.
 */
import { create } from 'zustand'
import { api, type ApiUser } from '@/api/client'
import { track } from '@/api/analytics'
import { navigate } from '@/io/navigation'

export interface AuthState {
  user: ApiUser | null
  /** `loading` until the first `fetchMe` settles; `ready` thereafter (signed in or not). */
  status: 'loading' | 'ready'

  /** Resolve the current session from `/api/me`; never rejects (failure ⇒ signed-out, ready). */
  fetchMe: () => Promise<void>
  /** Redirect the whole page to the OAuth login, returning to the current path afterward. */
  signIn: () => void
  /** POST logout, then clear the local user. */
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: 'loading',

  fetchMe: async () => {
    const res = await api<{ user: ApiUser | null }>('/api/me')
    set({
      user: res.ok ? res.data.user : null,
      status: 'ready',
    })
  },

  signIn: () => {
    track('signin_click')
    navigate(
      '/api/auth/login?returnTo=' + encodeURIComponent(location.pathname),
    )
  },

  signOut: async () => {
    await api<void>('/api/auth/logout', { method: 'POST' })
    set({ user: null })
  },
}))
