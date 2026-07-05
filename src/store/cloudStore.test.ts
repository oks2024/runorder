import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ApiResult } from '@/api/client'
import { useCloudStore } from './cloudStore'
import { useWorkflowStore } from './workflowStore'
import { blankSpec, codeReviewLoop } from '@/spec/seed'

// The API client is mocked so the store's network methods run against canned results.
vi.mock('@/api/client', () => ({ api: vi.fn() }))
import { api } from '@/api/client'
const mockApi = vi.mocked(api)

/** Type-narrowing helper: canned success payload for the next `api` call. */
const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data })

beforeEach(() => {
  mockApi.mockReset()
  useCloudStore.setState({ items: [], status: 'idle' })
  useWorkflowStore.getState().load(blankSpec()) // live doc = untitled
})

describe('cloudStore', () => {
  it('refresh populates items from the server', async () => {
    mockApi.mockResolvedValueOnce(
      ok({
        workflows: [
          { id: 'w1', name: 'alpha', isPublic: false, updatedAt: 'now' },
          { id: 'w2', name: 'beta', isPublic: true, updatedAt: 'now' },
        ],
      }),
    )
    await useCloudStore.getState().refresh()
    const state = useCloudStore.getState()
    expect(state.status).toBe('ready')
    expect(state.items.map((w) => w.name)).toEqual(['alpha', 'beta'])
  })

  it('refresh sets error status on a failed request', async () => {
    mockApi.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'boom',
    })
    await useCloudStore.getState().refresh()
    expect(useCloudStore.getState().status).toBe('error')
  })

  it('openFromCloud loads a validated spec through the workflow store', async () => {
    expect(useWorkflowStore.getState().spec.name).toBe('untitled')
    mockApi.mockResolvedValueOnce(
      ok({
        workflow: {
          id: 'w1',
          name: codeReviewLoop.name,
          isPublic: false,
          updatedAt: 'now',
          spec: codeReviewLoop,
        },
      }),
    )
    const result = await useCloudStore.getState().openFromCloud('w1')
    expect(result.ok).toBe(true)
    // Routed through the single spec-replace seam — the live doc is now the fetched spec.
    expect(useWorkflowStore.getState().spec.name).toBe(codeReviewLoop.name)
  })

  it('openFromCloud rejects an invalid server spec and leaves the live doc untouched', async () => {
    mockApi.mockResolvedValueOnce(
      ok({
        workflow: {
          id: 'w1',
          name: 'garbage',
          isPublic: false,
          updatedAt: 'now',
          spec: { not: 'a spec' },
        },
      }),
    )
    const result = await useCloudStore.getState().openFromCloud('w1')
    expect(result.ok).toBe(false)
    // Defense in depth held — the live doc is unchanged.
    expect(useWorkflowStore.getState().spec.name).toBe('untitled')
  })

  it('saveToCloud upserts the returned meta into items', async () => {
    mockApi.mockResolvedValueOnce(
      ok({
        workflow: {
          id: 'w1',
          name: 'alpha',
          isPublic: false,
          updatedAt: 'now',
        },
      }),
    )
    const result = await useCloudStore.getState().saveToCloud(blankSpec())
    expect(result.ok).toBe(true)
    expect(useCloudStore.getState().items).toHaveLength(1)
    expect(useCloudStore.getState().items[0].id).toBe('w1')
  })

  it('remove drops the workflow from items on success', async () => {
    useCloudStore.setState({
      items: [{ id: 'w1', name: 'alpha', isPublic: false, updatedAt: 'now' }],
    })
    mockApi.mockResolvedValueOnce(ok(undefined as void))
    const result = await useCloudStore.getState().remove('w1')
    expect(result.ok).toBe(true)
    expect(useCloudStore.getState().items).toHaveLength(0)
  })

  it('setPublic updates the workflow visibility on success', async () => {
    useCloudStore.setState({
      items: [{ id: 'w1', name: 'alpha', isPublic: false, updatedAt: 'now' }],
    })
    mockApi.mockResolvedValueOnce(
      ok({ workflow: { id: 'w1', isPublic: true } }),
    )
    const result = await useCloudStore.getState().setPublic('w1', true)
    expect(result.ok).toBe(true)
    expect(useCloudStore.getState().items[0].isPublic).toBe(true)
  })
})
