import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTeamFloorHighlight, TEAM_FLOOR_HIGHLIGHT_MS } from './team-floor-highlight'

describe('team floor highlight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks the pulsed members and tells whoever is listening', () => {
    const highlight = createTeamFloorHighlight()
    const listener = vi.fn()
    highlight.subscribe(listener)

    highlight.pulse(['ada', 'grace'])

    expect([...highlight.highlightedMemberIds()]).toEqual(['ada', 'grace'])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears itself after its duration, and not before', () => {
    const highlight = createTeamFloorHighlight()
    const listener = vi.fn()
    highlight.subscribe(listener)
    highlight.pulse(['ada'])

    vi.advanceTimersByTime(TEAM_FLOOR_HIGHLIGHT_MS - 1)
    expect(highlight.highlightedMemberIds().has('ada')).toBe(true)

    vi.advanceTimersByTime(1)
    expect(highlight.highlightedMemberIds().size).toBe(0)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('lets a later pulse replace an earlier one and restart the clock', () => {
    const highlight = createTeamFloorHighlight(1_000)
    highlight.pulse(['ada'])
    vi.advanceTimersByTime(900)

    highlight.pulse(['grace'])
    vi.advanceTimersByTime(900)
    expect([...highlight.highlightedMemberIds()]).toEqual(['grace'])

    vi.advanceTimersByTime(100)
    expect(highlight.highlightedMemberIds().size).toBe(0)
  })

  it('hands back the same set until it changes, so a subscriber does not re-render for nothing', () => {
    const highlight = createTeamFloorHighlight()
    const empty = highlight.highlightedMemberIds()
    highlight.pulse(['ada'])
    const marked = highlight.highlightedMemberIds()

    expect(highlight.highlightedMemberIds()).toBe(marked)
    vi.advanceTimersByTime(TEAM_FLOOR_HIGHLIGHT_MS)
    expect(highlight.highlightedMemberIds()).toBe(empty)
  })

  it('clears at once when asked, or when a pulse names nobody', () => {
    const highlight = createTeamFloorHighlight()
    const listener = vi.fn()
    highlight.pulse(['ada'])
    highlight.subscribe(listener)

    highlight.pulse([])
    expect(highlight.highlightedMemberIds().size).toBe(0)
    expect(listener).toHaveBeenCalledTimes(1)

    highlight.pulse(['ada'])
    highlight.clear()
    expect(highlight.highlightedMemberIds().size).toBe(0)
    // The cancelled clock must not fire into a later pulse.
    highlight.pulse(['grace'])
    vi.advanceTimersByTime(TEAM_FLOOR_HIGHLIGHT_MS - 1)
    expect(highlight.highlightedMemberIds().has('grace')).toBe(true)
  })

  it('stops telling a listener that unsubscribed', () => {
    const highlight = createTeamFloorHighlight()
    const listener = vi.fn()
    highlight.subscribe(listener)()

    highlight.pulse(['ada'])
    expect(listener).not.toHaveBeenCalled()
  })
})
