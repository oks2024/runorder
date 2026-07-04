import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryMenu } from './LibraryMenu'
import { useWorkflowStore } from '@/store/workflowStore'
import { useLibraryStore } from '@/store/libraryStore'
import { serializeSpec } from '@/io/persist'
import { codeReviewLoop } from '@/spec/seed'

// The DOM file plumbing is mocked so import/export don't touch the real file dialog.
vi.mock('@/io/download', () => ({
  readFileText: vi.fn(),
  downloadText: vi.fn(),
}))
import { readFileText, downloadText } from '@/io/download'

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /saved/i }))
}

beforeEach(() => {
  useLibraryStore.setState({ entries: {} })
  useWorkflowStore.getState().load() // fresh seed (name: code-review-loop)
  vi.mocked(readFileText).mockReset()
  vi.mocked(downloadText).mockReset()
})

describe('LibraryMenu', () => {
  it('Save writes the live spec into the library under its name', async () => {
    const user = userEvent.setup()
    render(<LibraryMenu />)
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: /^Save$/ }))
    expect(useLibraryStore.getState().has('code-review-loop')).toBe(true)
  })

  it('clicking a saved name opens it into the live worksheet', async () => {
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
      expect.stringContaining('"prewire"'),
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
})
