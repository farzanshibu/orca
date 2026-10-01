import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BEAT_STAGGER_MS } from './office-choreography-state'
import {
  TEST_WALK_MS,
  castMember,
  dispatchEntry,
  mailEntry
} from './office-choreography-test-fixtures'
import { WALL_CLOCK, createManualFloorClock } from './office-floor-clock'
import { createFloorDirector, type FloorDirectorInput } from './office-floor-director'
import type { TeamActivityEntry } from './team-activity-merge'

const CAST = [castMember('ada', 'waiting'), castMember('bo', 'working')]

function directorInput(overrides: Partial<FloorDirectorInput>): FloorDirectorInput {
  return {
    clock: WALL_CLOCK,
    epoch: 1,
    live: () => [],
    cast: CAST,
    reducedMotion: false,
    hidden: false,
    walkMs: () => TEST_WALK_MS,
    ...overrides
  }
}

describe('floor director on a manual clock', () => {
  it('moves only when the clock is moved, and picks up what was pushed on the next tick', () => {
    const clock = createManualFloorClock(50_000)
    let live: TeamActivityEntry[] = []
    const director = createFloorDirector()
    const changed = vi.fn()
    director.subscribe(changed)
    director.setInput(directorInput({ clock, live: () => live }))
    expect(director.scene().poses.size).toBe(0)

    live = [mailEntry(1, clock.now(), 'ada', ['bo'])]
    expect(director.scene().poses.size).toBe(0)
    clock.tick()
    expect(director.scene().poses.get('ada')?.kind).toBe('walking')
    expect(changed).toHaveBeenCalledTimes(1)

    clock.advance(TEST_WALK_MS)
    expect(director.scene().poses.get('ada')).toMatchObject({
      kind: 'away',
      at: { kind: 'beside' }
    })
    expect(director.scene().badges.get('bo')).toBe('mail')
    director.dispose()
  })

  it('acts out nothing the feed already held, and keeps one scene object while nothing changes', () => {
    const clock = createManualFloorClock(0)
    const director = createFloorDirector()
    const changed = vi.fn()
    director.subscribe(changed)
    director.setInput(directorInput({ clock, live: () => [mailEntry(1, 0, 'ada', ['bo'])] }))
    const before = director.scene()

    clock.advance(1_000)
    clock.advance(1_000)
    expect(director.scene()).toBe(before)
    expect(changed).not.toHaveBeenCalled()
    director.dispose()
  })

  it('starts over when it is handed another clock', () => {
    const first = createManualFloorClock(1_000)
    let live: TeamActivityEntry[] = []
    const director = createFloorDirector()
    director.setInput(directorInput({ clock: first, live: () => live }))
    live = [mailEntry(1, 1_000, 'ada', ['bo'])]
    first.tick()
    expect(director.scene().poses.size).toBe(1)

    director.setInput(directorInput({ clock: createManualFloorClock(9_000_000), live: () => live }))
    expect(director.scene().poses.size).toBe(0)
    // The old clock no longer drives anything.
    first.advance(500)
    expect(director.scene().poses.size).toBe(0)
    director.dispose()
  })

  it('stops listening once disposed', () => {
    const clock = createManualFloorClock(0)
    let live: TeamActivityEntry[] = []
    const director = createFloorDirector()
    director.setInput(directorInput({ clock, live: () => live }))
    director.dispose()

    live = [mailEntry(1, 0, 'ada', ['bo'])]
    clock.tick()
    expect(director.scene().poses.size).toBe(0)
  })
})

describe('floor director on the real clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('wakes itself for each change with one timer, and sets none when nothing is due', () => {
    const director = createFloorDirector()
    director.setInput(directorInput({}))
    expect(vi.getTimerCount()).toBe(0)

    const live = [mailEntry(1, Date.now(), 'ada', ['bo']), dispatchEntry(2, Date.now(), 'bo')]
    director.setInput(directorInput({ live: () => live }))
    expect(director.scene().poses.get('ada')?.kind).toBe('walking')
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(TEST_WALK_MS)
    expect(director.scene().poses.get('ada')?.kind).toBe('away')
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(60_000)
    expect(director.scene().poses.size).toBe(0)
    expect(director.scene().badges.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears its timer when disposed', () => {
    const director = createFloorDirector()
    director.setInput(directorInput({}))
    const live = [mailEntry(1, Date.now(), 'ada', ['bo']), mailEntry(2, Date.now(), 'ada', ['bo'])]
    director.setInput(directorInput({ live: () => live }))
    expect(vi.getTimerCount()).toBe(1)

    director.dispose()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(BEAT_STAGGER_MS * 4)
    expect(director.scene().poses.get('ada')?.kind).toBe('walking')
  })
})
