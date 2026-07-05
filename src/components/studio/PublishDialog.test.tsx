import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublishDialog } from './PublishDialog'
import { useCloudStore } from '@/store/cloudStore'
import { useWorkflowStore } from '@/store/workflowStore'
import type { CloudWorkflowMeta } from '@/api/client'

// The Turnstile widget is mocked: renderTurnstile records its handlers so the test can supply a
// token, and never touches the real Cloudflare script.
vi.mock('@/lib/turnstile', () => ({
  renderTurnstile: vi.fn(() => Promise.resolve('widget-1')),
  removeTurnstile: vi.fn(),
  turnstileSiteKey: () => 'test-key',
}))
import { renderTurnstile } from '@/lib/turnstile'
const mockRender = vi.mocked(renderTurnstile)

const meta = (over: Partial<CloudWorkflowMeta> = {}): CloudWorkflowMeta => ({
  id: 'w1',
  name: 'demo',
  isPublic: false,
  updatedAt: 'now',
  ...over,
})

/** Replace the cloud store's network methods with spies for the next render. */
function stubCloud(over: Partial<ReturnType<typeof useCloudStore.getState>>) {
  useCloudStore.setState(over)
}

beforeEach(() => {
  mockRender.mockClear()
  useWorkflowStore.getState().load() // known live spec (seed)
  useCloudStore.setState({ items: [], status: 'idle' })
})

describe('PublishDialog', () => {
  it('saves on open and gates Publish on a Turnstile token', async () => {
    const user = userEvent.setup()
    const setPublic = vi.fn(async () => ({ ok: true as const }))
    stubCloud({
      saveToCloud: vi.fn(async () => ({ ok: true as const, meta: meta() })),
      setPublic,
    })

    render(<PublishDialog onClose={() => {}} />)

    // Lands on the private → publish gate with the widget rendered.
    await screen.findByText(/this workflow is private/i)
    await waitFor(() => expect(mockRender).toHaveBeenCalled())

    const publish = screen.getByRole('button', { name: /^publish$/i })
    expect(publish).toBeDisabled()

    // Deliver a token through the widget's callback.
    const handlers = mockRender.mock.calls[0][1]
    act(() => handlers.onToken('tok-123'))

    expect(publish).toBeEnabled()
    await user.click(publish)
    expect(setPublic).toHaveBeenCalledWith('w1', true, 'tok-123')
  })

  it('shows the share link and a Make private action for a public workflow', async () => {
    const user = userEvent.setup()
    const setPublic = vi.fn(async () => ({ ok: true as const }))
    stubCloud({
      saveToCloud: vi.fn(async () => ({
        ok: true as const,
        meta: meta({ isPublic: true }),
      })),
      setPublic,
    })

    render(<PublishDialog onClose={() => {}} />)

    const link = await screen.findByLabelText<HTMLInputElement>(/share link/i)
    expect(link.value).toContain('/w/w1')
    expect(mockRender).not.toHaveBeenCalled() // no widget when already public

    await user.click(screen.getByRole('button', { name: /make private/i }))
    expect(setPublic).toHaveBeenCalledWith('w1', false)
  })

  it('surfaces a save failure', async () => {
    stubCloud({
      saveToCloud: vi.fn(async () => ({
        ok: false as const,
        error: 'over quota',
      })),
      setPublic: vi.fn(),
    })

    render(<PublishDialog onClose={() => {}} />)

    await screen.findByText(/over quota/i)
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })
})
