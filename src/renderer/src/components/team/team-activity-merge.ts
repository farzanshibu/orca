import type { TeamActivityEvent, TeamActivityPage } from '../../../../shared/team-activity-event'

/** The most events the page keeps; older ones fall off the front. */
export const TEAM_ACTIVITY_BUFFER_SIZE = 500

/** Where a page came from: the host's event feed, or its old message log mapped to events. */
export type TeamActivitySource = 'activity' | 'legacy'

export type TeamActivityEntry = {
  event: TeamActivityEvent
  /** Already on the host when this buffer started: shown in the feed, never animated. */
  history: boolean
  /** The client clock when the page carrying it landed. Host timestamps schedule nothing. */
  arrivedAt: number
}

export type TeamActivityLog = {
  /** In sequence order, at most TEAM_ACTIVITY_BUFFER_SIZE. */
  entries: readonly TeamActivityEntry[]
  /** `afterSequence` for the next poll; null until a first page lands. */
  cursor: number | null
  source: TeamActivitySource | null
  /** Bumped whenever the buffer is replaced instead of extended, so a reader drops what it derived. */
  epoch: number
}

export type TeamActivityRead = { source: TeamActivitySource; page: TeamActivityPage }

export type TeamActivityMerge = {
  log: TeamActivityLog
  /** The live entries this page added, in sequence order. */
  fresh: readonly TeamActivityEntry[]
}

export const EMPTY_TEAM_ACTIVITY_LOG: TeamActivityLog = {
  entries: [],
  cursor: null,
  source: null,
  epoch: 0
}

/** The log a new team or host starts from; the epoch moves so nothing derived from the old one survives. */
export function clearedTeamActivityLog(log: TeamActivityLog): TeamActivityLog {
  return { ...EMPTY_TEAM_ACTIVITY_LOG, epoch: log.epoch + 1 }
}

function newestInSequenceOrder(entries: Iterable<TeamActivityEntry>): TeamActivityEntry[] {
  return [...entries]
    .toSorted((a, b) => a.event.sequence - b.event.sequence)
    .slice(-TEAM_ACTIVITY_BUFFER_SIZE)
}

function byEventId(entries: readonly TeamActivityEntry[]): Map<string, TeamActivityEntry> {
  return new Map(entries.map((entry) => [entry.event.id, entry]))
}

/**
 * Adds one page to the log. A first page, a page from another source and a `reset` page are not a
 * continuation of what is held: they replace it, as history.
 */
export function mergeTeamActivityPage(
  log: TeamActivityLog,
  read: TeamActivityRead,
  arrivedAt: number
): TeamActivityMerge {
  const { source, page } = read
  if (log.cursor === null || log.source !== source || page.reset) {
    const entries = page.events.map((event) => ({ event, history: true, arrivedAt }))
    return {
      log: {
        entries: newestInSequenceOrder(byEventId(entries).values()),
        cursor: page.latestSequence,
        source,
        epoch: log.epoch + 1
      },
      fresh: []
    }
  }
  const cursor = Math.max(log.cursor, page.latestSequence)
  if (page.events.length === 0) {
    return { log: cursor === log.cursor ? log : { ...log, cursor }, fresh: [] }
  }
  const known = byEventId(log.entries)
  const fresh: TeamActivityEntry[] = []
  for (const event of page.events) {
    const held = known.get(event.id)
    if (held) {
      // The same event again, such as a group send whose sequence moved to its last recipient:
      // it stays one entry and keeps when it was first seen, so it is never animated twice.
      known.set(event.id, { ...held, event })
    } else if (event.sequence > log.cursor) {
      const entry = { event, history: false, arrivedAt }
      known.set(event.id, entry)
      fresh.push(entry)
    }
  }
  return {
    log: { ...log, entries: newestInSequenceOrder(known.values()), cursor },
    fresh: fresh.toSorted((a, b) => a.event.sequence - b.event.sequence)
  }
}

/** What arrived after the first page: the only events the floor may act out. */
export function liveTeamActivity(log: TeamActivityLog): TeamActivityEntry[] {
  return log.entries.filter((entry) => !entry.history)
}
