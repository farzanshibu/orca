import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamActivityReader, TeamActivityReadRequest } from './team-activity-legacy'
import type { TeamActivityRead } from './team-activity-merge'
import { createTeamActivityPoller } from './team-activity-poller'
import { makeTeamActivityEvent, makeTeamActivityPage } from './team-activity-test-fixtures'

type PendingRead = {
  request: TeamActivityReadRequest
  land: (
    sequences: number[],
    page?: { hasMore?: boolean; latestSequence?: number }
  ) => Promise<void>
  fail: (message: string) => Promise<void>
}

/** A reader whose answers the test hands out one by one, so a request can be held in flight. */
function heldReader(source: TeamActivityRead['source'] = 'activity') {
  const pending: PendingRead[] = []
  const read = vi.fn<TeamActivityReader>(
    (request) =>
      new Promise<TeamActivityRead>((resolve, reject) => {
        pending.push({
          request,
          land: async (sequences, page) => {
            resolve({
              source,
              page: makeTeamActivityPage(
                sequences.map((sequence) => makeTeamActivityEvent(sequence)),
                page
              )
            })
            await vi.advanceTimersByTimeAsync(0)
          },
          fail: async (message) => {
            reject(new Error(message))
            await vi.advanceTimersByTimeAsync(0)
          }
        })
      })
  )
  return { read, pending }
}

function makePoller() {
  const visibility = { floorVisible: true, windowVisible: true }
  const onFresh = vi.fn()
  const poller = createTeamActivityPoller({ visibility: () => visibility, onFresh })
  return { poller, visibility, onFresh }
}

const sequencesOf = (poller: ReturnType<typeof makePoller>['poller']): number[] =>
  poller.getState().log.entries.map((entry) => entry.event.sequence)

describe('team activity poller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks at once, then only after the answer and the wait', async () => {
    const { poller } = makePoller()
    const { read, pending } = heldReader()
    poller.start(read)
    expect(read).toHaveBeenCalledTimes(1)
    expect(pending[0].request).toMatchObject({ source: null, afterSequence: null })

    await pending[0].land([1, 2])
    expect(sequencesOf(poller)).toEqual([1, 2])

    await vi.advanceTimersByTimeAsync(999)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(2)
    expect(pending[1].request).toMatchObject({ source: 'activity', afterSequence: 2 })
  })

  it('never has two requests in flight, however long the first takes', async () => {
    const { poller, visibility } = makePoller()
    const { read } = heldReader()
    poller.start(read)

    await vi.advanceTimersByTimeAsync(120_000)
    visibility.floorVisible = false
    poller.retime()
    visibility.floorVisible = true
    poller.retime()
    await vi.advanceTimersByTimeAsync(120_000)

    expect(read).toHaveBeenCalledTimes(1)
  })

  it('drops the answer of a generation that was replaced, and aborts its request', async () => {
    const { poller, onFresh } = makePoller()
    const before = heldReader()
    const after = heldReader()
    poller.start(before.read)
    poller.start(after.read)
    expect(before.pending[0].request.signal.aborted).toBe(true)
    expect(after.pending[0].request.signal.aborted).toBe(false)

    await before.pending[0].land([70, 71])
    expect(poller.getState()).toMatchObject({ log: { entries: [], cursor: null }, error: null })

    await after.pending[0].land([1])
    expect(sequencesOf(poller)).toEqual([1])
    // The dropped answer started no chain of its own: one request per reader so far.
    await vi.advanceTimersByTimeAsync(999)
    expect(before.read).toHaveBeenCalledTimes(1)
    expect(after.read).toHaveBeenCalledTimes(1)
    expect(onFresh).not.toHaveBeenCalled()
  })

  it('drops the failure of a replaced generation too', async () => {
    const { poller } = makePoller()
    const before = heldReader()
    const after = heldReader()
    poller.start(before.read)
    poller.start(after.read)

    await before.pending[0].fail('lost the old host')
    expect(poller.getState().error).toBeNull()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(before.read).toHaveBeenCalledTimes(1)
  })

  it('forgets the previous team when it starts another, under a new epoch', async () => {
    const { poller } = makePoller()
    const first = heldReader()
    poller.start(first.read)
    await first.pending[0].land([1, 2])
    const epoch = poller.getState().log.epoch

    poller.start(heldReader().read)
    expect(poller.getState().log).toMatchObject({ entries: [], cursor: null })
    expect(poller.getState().log.epoch).toBeGreaterThan(epoch)
  })

  it('stops when started with nothing to read', async () => {
    const { poller } = makePoller()
    const { read, pending } = heldReader()
    poller.start(read)
    await pending[0].land([1])

    poller.start(null)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(read).toHaveBeenCalledTimes(1)
    expect(poller.getState().log.entries).toEqual([])
  })

  it('reports only what arrived after the first page as fresh', async () => {
    const { poller, onFresh } = makePoller()
    const { read, pending } = heldReader()
    poller.start(read)
    await pending[0].land([1, 2])
    expect(onFresh).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    await pending[1].land([3])
    expect(onFresh).toHaveBeenCalledTimes(1)
    expect(onFresh.mock.calls[0][0]).toMatchObject([{ event: { sequence: 3 }, history: false }])
  })

  it('keeps what it has on a failure and backs off, then recovers', async () => {
    const { poller } = makePoller()
    const { read, pending } = heldReader()
    poller.start(read)
    await pending[0].land([1])
    await vi.advanceTimersByTimeAsync(1_000)

    await pending[1].fail('runtime_timeout')
    expect(poller.getState().error).toBe('runtime_timeout')
    expect(sequencesOf(poller)).toEqual([1])

    await vi.advanceTimersByTimeAsync(1_999)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(3)

    await pending[2].fail('runtime_timeout')
    await vi.advanceTimersByTimeAsync(3_999)
    expect(read).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(4)

    await pending[3].land([2])
    expect(poller.getState().error).toBeNull()
    expect(sequencesOf(poller)).toEqual([1, 2])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(read).toHaveBeenCalledTimes(5)
  })

  it('asks again at once while the host holds more', async () => {
    const { poller } = makePoller()
    const { read, pending } = heldReader()
    poller.start(read)
    await pending[0].land([1])
    await vi.advanceTimersByTimeAsync(1_000)

    await pending[1].land([2], { hasMore: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('moves the wait in progress when the visibility changes', async () => {
    const { poller, visibility } = makePoller()
    const { read, pending } = heldReader()
    visibility.windowVisible = false
    poller.start(read)
    await pending[0].land([1])

    await vi.advanceTimersByTimeAsync(400)
    visibility.windowVisible = true
    poller.retime()
    // Timed from when the last poll settled, not from the change.
    await vi.advanceTimersByTimeAsync(599)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('polls straight away when the new wait is already over', async () => {
    const { poller, visibility } = makePoller()
    const { read, pending } = heldReader()
    visibility.windowVisible = false
    poller.start(read)
    await pending[0].land([1])

    await vi.advanceTimersByTimeAsync(20_000)
    visibility.windowVisible = true
    poller.retime()
    await vi.advanceTimersByTimeAsync(0)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('polls a host without the feed at the fallback pace', async () => {
    const { poller } = makePoller()
    const { read, pending } = heldReader('legacy')
    poller.start(read)
    await pending[0].land([1])

    await vi.advanceTimersByTimeAsync(2_999)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('tells subscribers about changes only', async () => {
    const { poller } = makePoller()
    const { pending, read } = heldReader()
    const listener = vi.fn()
    const unsubscribe = poller.subscribe(listener)
    poller.start(read)
    await pending[0].land([1])
    expect(listener).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    await pending[1].land([])
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    await vi.advanceTimersByTimeAsync(1_000)
    await pending[2].land([2])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
