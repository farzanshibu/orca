import type { TeamActivityEvent } from '../../../../shared/team-activity-event'
import type { TeamActivityEntry } from './team-activity-merge'

export const TEAM_FEED_FAMILIES = ['mail', 'work', 'people'] as const
export type TeamFeedFamily = (typeof TEAM_FEED_FAMILIES)[number]
export type TeamFeedFamilyFilter = TeamFeedFamily | 'all'

export function isTeamFeedFamilyFilter(value: string): value is TeamFeedFamilyFilter {
  return value === 'all' || TEAM_FEED_FAMILIES.some((family) => family === value)
}

const WORK_KIND = /^(?:task|dispatch|goal|gate)_/
const PEOPLE_KIND = /^(?:member|hire)_/

/**
 * The filter a kind belongs under. Matched on the prefix, so a kind a newer host adds lands with
 * its siblings; one that fits nowhere has no family and shows under "All" only.
 */
export function teamFeedFamily(kind: string): TeamFeedFamily | null {
  if (kind === 'message' || kind === 'delivery') {
    return 'mail'
  }
  if (WORK_KIND.test(kind)) {
    return 'work'
  }
  return PEOPLE_KIND.test(kind) ? 'people' : null
}

/** Every member an event names, sender first, each once. */
export function teamActivityMemberIds(event: Pick<TeamActivityEvent, 'from' | 'to'>): string[] {
  const ids = event.from.member_id
    ? [event.from.member_id, ...event.to.member_ids]
    : event.to.member_ids
  return [...new Set(ids)]
}

export type TeamFeedRow = {
  entry: TeamActivityEntry
  /** Messages of this row's thread that the feed holds, itself included; 1 outside a thread. */
  threadSize: number
  /** The recipient's mailbox read it. Only known for mail to one recipient. */
  read: boolean
}

// A mailbox receipt says a message was read; it is a fact about that message, not a row of its own.
function isReadReceipt(event: TeamActivityEvent): boolean {
  return event.kind === 'delivery' && event.channel === 'mailbox' && event.status === 'read'
}

/** The rows the feed shows, oldest first: receipts fold into the message they are about. */
export function buildTeamFeedRows(entries: readonly TeamActivityEntry[]): TeamFeedRow[] {
  const readMessageIds = new Set<string>()
  const threadSizes = new Map<string, number>()
  for (const { event } of entries) {
    if (isReadReceipt(event)) {
      if (event.message_id) {
        readMessageIds.add(event.message_id)
      }
    } else if (event.kind === 'message' && event.thread_id) {
      threadSizes.set(event.thread_id, (threadSizes.get(event.thread_id) ?? 0) + 1)
    }
  }
  return entries
    .filter((entry) => !isReadReceipt(entry.event))
    .map((entry) => {
      const { event } = entry
      const isMessage = event.kind === 'message'
      return {
        entry,
        threadSize: isMessage && event.thread_id ? (threadSizes.get(event.thread_id) ?? 1) : 1,
        read:
          isMessage &&
          event.to.member_ids.length <= 1 &&
          event.message_id !== null &&
          readMessageIds.has(event.message_id)
      }
    })
}

export type TeamFeedFilter = {
  family: TeamFeedFamilyFilter
  /** Only events this member sent or received. */
  memberId: string | null
  /** Only this thread's messages; the other two filters are set aside while it is set. */
  threadId: string | null
}

export const UNFILTERED_TEAM_FEED: TeamFeedFilter = {
  family: 'all',
  memberId: null,
  threadId: null
}

function involves(event: TeamActivityEvent, memberId: string): boolean {
  return event.from.member_id === memberId || event.to.member_ids.includes(memberId)
}

export function filterTeamFeedRows(
  rows: readonly TeamFeedRow[],
  filter: TeamFeedFilter
): TeamFeedRow[] {
  const { family, memberId, threadId } = filter
  if (threadId !== null) {
    return rows.filter(({ entry }) => entry.event.thread_id === threadId)
  }
  return rows.filter(
    ({ entry: { event } }) =>
      (family === 'all' || teamFeedFamily(event.kind) === family) &&
      (memberId === null || involves(event, memberId))
  )
}

// Mail Orca, the human or an outside trigger wrote into the team, as opposed to members talking.
const OUTSIDE_PARTIES = new Set(['operator', 'external', 'system'])

/** Which mail one of the page's message lists shows. */
export type TeamMailScope =
  | { kind: 'all' }
  | { kind: 'between-agents' }
  | { kind: 'from-outside' }
  | { kind: 'member'; memberId: string }

/** The messages and delivered notes among `rows` that fall in `scope`. */
export function teamMailRows(rows: readonly TeamFeedRow[], scope: TeamMailScope): TeamFeedRow[] {
  return rows.filter(({ entry: { event } }) => {
    if (teamFeedFamily(event.kind) !== 'mail') {
      return false
    }
    switch (scope.kind) {
      case 'all':
        return true
      case 'between-agents':
        return !OUTSIDE_PARTIES.has(event.from.party)
      case 'from-outside':
        return OUTSIDE_PARTIES.has(event.from.party)
      case 'member':
        return involves(event, scope.memberId)
    }
  })
}

/** Rows newer than the last one the reader saw: the count on the "N new" pill. */
export function countUnseenTeamFeedRows(
  rows: readonly TeamFeedRow[],
  seenThroughSequence: number
): number {
  return rows.filter(({ entry }) => entry.event.sequence > seenThroughSequence).length
}
