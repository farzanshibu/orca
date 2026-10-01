import type { TeamActivityEvent } from '../../../../shared/team-activity-event'
import type { TeamActivityEntry } from './team-activity-merge'

/** Long enough for the events of one host action to land together, short enough to feel immediate. */
export const TEAM_SNAPSHOT_REFRESH_DELAY_MS = 300

// Mail that adds to what the snapshot lists as waiting on the human.
const ATTENTION_MESSAGE_TYPES = new Set(['question', 'decision_gate'])

/**
 * Whether the snapshot the floor draws from is out of date once this event exists. Plain mail and
 * its receipts change nothing there; every other kind does, including one this build has no name
 * for, since reading the snapshot once too often costs less than a floor that missed a change.
 */
export function teamActivityChangesFloor(
  event: Pick<TeamActivityEvent, 'kind' | 'message_type'>
): boolean {
  if (event.kind === 'message') {
    return ATTENTION_MESSAGE_TYPES.has(event.message_type ?? '')
  }
  return event.kind !== 'delivery'
}

export type TeamSnapshotRefreshTrigger = {
  /** Asks for one refresh shortly after the last floor-changing event of a burst. */
  notify: (entries: readonly TeamActivityEntry[]) => void
  cancel: () => void
}

export function createTeamSnapshotRefreshTrigger(
  refresh: () => void,
  delayMs: number = TEAM_SNAPSHOT_REFRESH_DELAY_MS
): TeamSnapshotRefreshTrigger {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return {
    notify: (entries) => {
      if (!entries.some((entry) => teamActivityChangesFloor(entry.event))) {
        return
      }
      cancel()
      timer = setTimeout(() => {
        timer = null
        refresh()
      }, delayMs)
    },
    cancel
  }
}
