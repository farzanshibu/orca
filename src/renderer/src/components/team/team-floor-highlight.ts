import { useSyncExternalStore } from 'react'

/** How long a pulse marks its members before it clears itself. */
export const TEAM_FLOOR_HIGHLIGHT_MS = 2_500

const NOBODY: ReadonlySet<string> = new Set()

export type TeamFloorHighlight = {
  /** The members to mark on the floor right now. The same set until it changes. */
  highlightedMemberIds: () => ReadonlySet<string>
  subscribe: (listener: () => void) => () => void
  /** Marks these members for a moment. A later pulse replaces an earlier one and restarts the clock. */
  pulse: (memberIds: readonly string[]) => void
  clear: () => void
}

/**
 * Who the feed is pointing at on the floor. Its own small store, not page state: the feed writes it
 * and the floor reads it, and neither has to know the other is mounted.
 */
export function createTeamFloorHighlight(
  durationMs: number = TEAM_FLOOR_HIGHLIGHT_MS
): TeamFloorHighlight {
  const listeners = new Set<() => void>()
  let highlighted = NOBODY
  let timer: ReturnType<typeof setTimeout> | null = null

  const set = (next: ReadonlySet<string>): void => {
    if (next === highlighted) {
      return
    }
    highlighted = next
    for (const listener of listeners) {
      listener()
    }
  }
  const stopClock = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  const clear = (): void => {
    stopClock()
    set(NOBODY)
  }

  return {
    highlightedMemberIds: () => highlighted,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    pulse: (memberIds) => {
      stopClock()
      if (memberIds.length === 0) {
        set(NOBODY)
        return
      }
      set(new Set(memberIds))
      timer = setTimeout(clear, durationMs)
    },
    clear
  }
}

/** The one highlight the Team page shares. */
export const teamFloorHighlight = createTeamFloorHighlight()

/** The members the feed is pointing at, for a floor (or a row) that wants to mark them. */
export function useHighlightedTeamMemberIds(): ReadonlySet<string> {
  return useSyncExternalStore(teamFloorHighlight.subscribe, teamFloorHighlight.highlightedMemberIds)
}
