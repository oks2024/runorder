import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthButton } from './AuthButton'
import { useAuthStore } from '@/store/authStore'

// The API client and the navigation seam are mocked so no fetch or jsdom navigation runs.
vi.mock('@/api/client', () => ({ api: vi.fn() }))
vi.mock('@/io/navigation', () => ({ navigate: vi.fn() }))
import { api } from '@/api/client'
import { navigate } from '@/io/navigation'
const mockApi = vi.mocked(api)
const mockNavigate = vi.mocked(navigate)

beforeEach(() => {
  mockApi.mockReset()
  mockNavigate.mockReset()
  useAuthStore.setState({ user: null, status: 'ready' })
})

describe('AuthButton', () => {
  it('renders nothing while auth is still loading', () => {
    useAuthStore.setState({ user: null, status: 'loading' })
    const { container } = render(<AuthButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('signed out: shows Sign in and clicking starts the OAuth redirect', async () => {
    const user = userEvent.setup()
    render(<AuthButton />)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate.mock.calls[0][0]).toMatch(
      /\/api\/auth\/login\?returnTo=/,
    )
  })

  it('signed in: shows an avatar, opens the menu, and Sign out clears the store', async () => {
    useAuthStore.setState({
      user: { login: 'octocat', name: 'Octo', avatarUrl: null },
      status: 'ready',
    })
    mockApi.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    render(<AuthButton />)

    // The avatar is the account menu trigger.
    const trigger = screen.getByRole('button', { name: /account: octocat/i })
    await user.click(trigger)

    // Menu shows the login and a Sign out action.
    expect(await screen.findByText('octocat')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(mockApi).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull())
  })
})
