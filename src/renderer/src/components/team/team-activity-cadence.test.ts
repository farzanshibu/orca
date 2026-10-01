import { describe, expect, it } from 'vitest'
import { teamActivityPollDelay, type TeamActivityCadenceInput } from './team-activity-cadence'

const delay = (overrides: Partial<TeamActivityCadenceInput> = {}): number =>
  teamActivityPollDelay({
    floorVisible: true,
    windowVisible: true,
    source: 'activity',
    failures: 0,
    hasMore: false,
    ...overrides
  })

describe('teamActivityPollDelay', () => {
  it('polls every second while the floor is on screen', () => {
    expect(delay()).toBe(1_000)
    // Before the first page the source is not known yet.
    expect(delay({ source: null })).toBe(1_000)
  })

  it('polls every 5 s on another tab of the page', () => {
    expect(delay({ floorVisible: false })).toBe(5_000)
  })

  it('polls every 30 s while the window is hidden, whichever tab is selected', () => {
    expect(delay({ windowVisible: false })).toBe(30_000)
    expect(delay({ windowVisible: false, floorVisible: false })).toBe(30_000)
    expect(delay({ windowVisible: false, source: 'legacy' })).toBe(30_000)
  })

  it('polls every 3 s in fallback mode, and no faster than another tab would', () => {
    expect(delay({ source: 'legacy' })).toBe(3_000)
    expect(delay({ source: 'legacy', floorVisible: false })).toBe(5_000)
  })

  it('asks again at once while the host says it holds more', () => {
    expect(delay({ hasMore: true })).toBe(0)
    expect(delay({ hasMore: true, windowVisible: false })).toBe(0)
  })

  it('backs off on errors, doubling up to 15 s', () => {
    expect([1, 2, 3, 4, 5, 40].map((failures) => delay({ failures }))).toEqual([
      2_000, 4_000, 8_000, 15_000, 15_000, 15_000
    ])
    expect(delay({ failures: 1, floorVisible: false })).toBe(10_000)
    expect(delay({ failures: 2, floorVisible: false })).toBe(15_000)
    expect(delay({ failures: 1, source: 'legacy' })).toBe(6_000)
  })

  it('never polls a hidden window faster because it failed', () => {
    expect(delay({ failures: 3, windowVisible: false })).toBe(30_000)
  })

  it('does not drain a backlog while failing', () => {
    expect(delay({ failures: 1, hasMore: true })).toBe(2_000)
  })
})
