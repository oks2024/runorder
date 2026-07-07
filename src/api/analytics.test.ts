import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { track } from './analytics'

/** Capture the beacon payload sent for a given call, decoding the Blob body back to JSON. */
async function beaconBody(blob: unknown): Promise<unknown> {
  return JSON.parse(await (blob as Blob).text())
}

describe('analytics — track', () => {
  let sendBeacon: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon, doNotTrack: '0' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a beacon to /api/events with the name, path, and props', async () => {
    track('pattern_insert', { kind: 'loop' })
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeacon.mock.calls[0]
    expect(url).toBe('/api/events')
    expect(await beaconBody(blob)).toEqual({
      name: 'pattern_insert',
      path: window.location.pathname,
      props: { kind: 'loop' },
    })
  })

  it('respects Do Not Track and sends nothing', () => {
    vi.stubGlobal('navigator', { sendBeacon, doNotTrack: '1' })
    track('cloud_save')
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('respects Global Privacy Control', () => {
    vi.stubGlobal('navigator', { sendBeacon, globalPrivacyControl: true })
    track('cloud_save')
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('never throws even if the transport blows up', () => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('boom')
      },
    })
    expect(() => track('cloud_save')).not.toThrow()
  })
})
