import type { TeamActivitySource } from './team-activity-merge'

export const TEAM_ACTIVITY_CADENCE = {
  /** The floor is on screen: events become movement, so they should land close to when they happen. */
  floorMs: 1_000,
  /** Another tab of the page is showing; the feed only has to stay roughly current. */
  otherTabMs: 5_000,
  /** Nobody is looking at the window. */
  hiddenWindowMs: 30_000,
  /** A host without the feed sends its whole message log each time, so it is asked less often. */
  legacyMs: 3_000,
  maxBackoffMs: 15_000
} as const

export type TeamActivityVisibility = {
  /** The Floor tab is the one showing. */
  floorVisible: boolean
  windowVisible: boolean
}

export type TeamActivityCadenceInput = TeamActivityVisibility & {
  source: TeamActivitySource | null
  /** Polls that have failed in a row. */
  failures: number
  /** The last page said the host holds more past it. */
  hasMore: boolean
}

function steadyDelay(input: TeamActivityCadenceInput): number {
  if (!input.windowVisible) {
    return TEAM_ACTIVITY_CADENCE.hiddenWindowMs
  }
  const tab = input.floorVisible ? TEAM_ACTIVITY_CADENCE.floorMs : TEAM_ACTIVITY_CADENCE.otherTabMs
  return input.source === 'legacy' ? Math.max(tab, TEAM_ACTIVITY_CADENCE.legacyMs) : tab
}

/** How long to wait after one poll settles before starting the next. */
export function teamActivityPollDelay(input: TeamActivityCadenceInput): number {
  const steady = steadyDelay(input)
  if (input.failures > 0) {
    // Never shorter than the steady wait: a hidden window does not poll faster because it failed.
    return Math.max(
      steady,
      Math.min(TEAM_ACTIVITY_CADENCE.maxBackoffMs, steady * 2 ** input.failures)
    )
  }
  return input.hasMore ? 0 : steady
}
