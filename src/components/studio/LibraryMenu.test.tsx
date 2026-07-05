import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryMenu } from './LibraryMenu'
import { useWorkflowStore } from '@/store/workflowStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useAuthStore } from '@/store/authStore'
import { useCloudStore } from '@/store/cloudStore'
import { serializeSpec } from '@/io/persist'
import { codeReviewLoop } from '@/spec/seed'
import type { ApiResult } from '@/api/client'

// The DOM file plumbing is mocked so import/export don't touch the real file dialog.
vi.mock('@/io/download', () => ({
  readFileText: vi.fn(),
  downloadText: vi.fn(),
}))
// The API client (used by the cloud store) and the sign-in navigation seam are mocked.
vi.mock('@/api/client', () => ({ api: vi.fn() }))
vi.mock('@/io/navigation', () => ({ navigate: vi.fn() }))
import { readFileText, downloadText } from '@/io/download'
import { api } from '@/api/client'
const mockApi = vi.mocked(api)
const okApi = <T,>(data: T): ApiResult<T> => ({ ok: true, data })

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /saved/i }))
}

beforeEach(() => {
  useLibraryStore.setState({ entries: {} })
  useWorkflowStore.getState().load() // fresh seed (name: code-review-loop)
  useAuthStore.setState({ user: null, status: 'ready' }) // signed out by default
  useCloudStore.setState({ items: [], status: 'idle' })
  vi.mocked(readFileText).mockReset()
  vi.mocked(downloadText).mockReset()
  mockApi.mockReset()
})

/** Sign in with a canned user (the cloud group is signed-in only). */
const signIn = () =>
  useAuthStore.setState({
    user: { login: 'octocat', name: 'Octo', avatarUrl: null },
    status: 'ready',
  })

describe('LibraryMenu', () => {
  it('Save writes the live spec into the library under its name', async () => {
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: /^Save$/ }))
    expect(useLibraryStore.getState().has('code-review-loop')).toBe(true)
  })

  it('clicking a saved name opens it into the live rundown', async () => {
    useLibraryStore.getState().save({ ...codeReviewLoop, name: 'other-flow' })
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /other-flow/ }),
    )
    expect(useWorkflowStore.getState().spec.name).toBe('other-flow')
  })

  it('Export downloads the serialized spec under a slugged filename', async () => {
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /Export JSON/ }),
    )
    expect(vi.mocked(downloadText)).toHaveBeenCalledWith(
      'code-review-loop.json',
      expect.stringContaining('"runorder"'),
    )
  })

  it('importing a file whose name already exists warns before updating', async () => {
    // A saved entry named 'code-review-loop' already exists (matches the imported file's name).
    useLibraryStore.getState().save(codeReviewLoop)
    vi.mocked(readFileText).mockResolvedValue(serializeSpec(codeReviewLoop))

    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /Import JSON/ }),
    )

    // The collision confirmation appears instead of silently overwriting.
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Update/ })).toBeInTheDocument()
  })

  it('New workflow replaces an untouched seed without confirmation', async () => {
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /New workflow/ }),
    )
    expect(useWorkflowStore.getState().spec.name).toBe('untitled')
  })

  it('New workflow warns when the live doc has unsaved changes; confirming discards them', async () => {
    useWorkflowStore.getState().setName('my-flow') // edited + never saved = dirty
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /New workflow/ }),
    )

    expect(await screen.findByText(/unsaved changes/i)).toBeInTheDocument()
    expect(useWorkflowStore.getState().spec.name).toBe('my-flow') // untouched until confirmed
    await user.click(screen.getByRole('button', { name: /Discard & create/ }))
    expect(useWorkflowStore.getState().spec.name).toBe('untitled')
  })

  it('opening a saved workflow over unsaved changes warns first; Cancel keeps the doc', async () => {
    useLibraryStore.getState().save({ ...codeReviewLoop, name: 'other-flow' })
    useWorkflowStore.getState().setName('my-flow')
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /other-flow/ }),
    )

    expect(await screen.findByText(/unsaved changes/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(useWorkflowStore.getState().spec.name).toBe('my-flow')
  })

  it('importing an invalid file surfaces the parse error', async () => {
    vi.mocked(readFileText).mockResolvedValue('{ not json')
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /Import JSON/ }),
    )
    expect(await screen.findByText(/Not valid JSON/)).toBeInTheDocument()
  })

  it('signed out: no cloud group, offers "Sign in to sync" instead', async () => {
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    expect(
      await screen.findByRole('menuitem', { name: /Sign in to sync/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: /Save to cloud/ }),
    ).not.toBeInTheDocument()
  })

  it('signed in: lists cloud workflows and offers Save to cloud', async () => {
    signIn()
    useCloudStore.setState({
      items: [{ id: 'w1', name: 'cloud-flow', isPublic: true, updatedAt: 'now' }],
      status: 'ready',
    })
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    expect(
      await screen.findByRole('menuitem', { name: /cloud-flow/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /Save to cloud/ }),
    ).toBeInTheDocument()
  })

  it('opening a cloud workflow over unsaved work confirms first, then loads', async () => {
    signIn()
    useCloudStore.setState({
      items: [
        { id: 'w1', name: 'code-review-loop', isPublic: false, updatedAt: 'now' },
      ],
      status: 'ready',
    })
    // Make the live doc dirty so the discard guard fires.
    useWorkflowStore.getState().setName('my-flow')
    // The cloud GET returns a valid spec (the seed under a different name).
    mockApi.mockResolvedValueOnce(
      okApi({
        workflow: {
          id: 'w1',
          name: 'opened-flow',
          isPublic: false,
          updatedAt: 'now',
          spec: { ...codeReviewLoop, name: 'opened-flow' },
        },
      }),
    )

    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /code-review-loop/ }),
    )

    // Discard confirmation appears before anything loads.
    expect(await screen.findByText(/unsaved changes/i)).toBeInTheDocument()
    expect(useWorkflowStore.getState().spec.name).toBe('my-flow')
    await user.click(screen.getByRole('button', { name: /Discard & open/ }))

    await waitFor(() =>
      expect(useWorkflowStore.getState().spec.name).toBe('opened-flow'),
    )
  })

  it('Save to cloud calls the client with the live spec', async () => {
    signIn()
    mockApi.mockResolvedValueOnce(
      okApi({
        workflow: {
          id: 'w1',
          name: 'code-review-loop',
          isPublic: false,
          updatedAt: 'now',
        },
      }),
    )
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(
      await screen.findByRole('menuitem', { name: /Save to cloud/ }),
    )

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/api/workflows', {
        method: 'POST',
        body: { spec: expect.objectContaining({ name: 'code-review-loop' }) },
      }),
    )
  })
})
