import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareLinkLoader } from './ShareLinkLoader'
import { useWorkflowStore } from '@/store/workflowStore'
import { useLibraryStore } from '@/store/libraryStore'
import { codeReviewLoop } from '@/spec/seed'
import type { ApiResult, CloudWorkflow } from '@/api/client'

// The API client is mocked so the boot fetch runs against canned results.
vi.mock('@/api/client', () => ({ api: vi.fn() }))
import { api } from '@/api/client'
const mockApi = vi.mocked(api)
const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data })

/** A valid shared spec with a recognizable name (renamed seed). */
const sharedSpec = { ...codeReviewLoop, name: 'shared-flow' }
const workflowResponse = (): { workflow: CloudWorkflow } => ({
  workflow: {
    id: 'abc123',
    name: 'shared-flow',
    isPublic: true,
    spec: sharedSpec,
    updatedAt: 'now',
  },
})

function setPath(path: string) {
  window.history.replaceState({}, '', path)
}

beforeEach(() => {
  mockApi.mockReset()
  useLibraryStore.setState({ entries: {} })
  useWorkflowStore.getState().load() // clean seed → not dirty
  setPath('/')
})

afterEach(() => setPath('/'))

describe('ShareLinkLoader', () => {
  it('does nothing on a non-share path', () => {
    render(<ShareLinkLoader />)
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('loads a shared workflow and clears the URL', async () => {
    setPath('/w/abc123')
    mockApi.mockResolvedValueOnce(ok(workflowResponse()))

    render(<ShareLinkLoader />)

    await waitFor(() =>
      expect(useWorkflowStore.getState().spec.name).toBe('shared-flow'),
    )
    expect(mockApi).toHaveBeenCalledWith('/api/workflows/abc123')
    expect(location.pathname).toBe('/') // URL rewritten so refresh won't re-trigger
  })

  it('confirms before replacing an unsaved rundown', async () => {
    const user = userEvent.setup()
    useWorkflowStore.getState().setName('my-edits') // live doc now dirty
    setPath('/w/abc123')
    mockApi.mockResolvedValueOnce(ok(workflowResponse()))

    render(<ShareLinkLoader />)

    await screen.findByText(/unsaved changes/i)
    // Held: the live doc is untouched until the user confirms.
    expect(useWorkflowStore.getState().spec.name).toBe('my-edits')

    await user.click(screen.getByRole('button', { name: /discard & open/i }))
    await waitFor(() =>
      expect(useWorkflowStore.getState().spec.name).toBe('shared-flow'),
    )
  })

  it('shows an error for a missing or private link', async () => {
    setPath('/w/abc123')
    mockApi.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'Not found.',
    })

    render(<ShareLinkLoader />)

    await screen.findByText(/no longer public/i)
    expect(useWorkflowStore.getState().spec.name).not.toBe('shared-flow')
  })
})
