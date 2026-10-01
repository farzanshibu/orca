import type { TeamActivityEvent, TeamActivityPage } from '../../../../shared/team-activity-event'
import type { TeamActivityRead, TeamActivitySource } from './team-activity-merge'
import { teamMemberForHandle, type TeamLogMessage, type TeamMember } from './team-snapshot-types'

/** Who is on the team, for naming the two ends of an old log row. */
export type TeamActivityRoster = { runId: string; members: readonly TeamMember[] }

const BODY_PREVIEW_MAX = 280
const DISPATCH_PREFIX = 'dispatch:'
/** How long the message log is used before the host is asked again whether it has the feed. */
export const TEAM_ACTIVITY_LEGACY_RECHECK_MS = 30_000

// Follows the host's own activity triggers: the Run mailbox is the manager's, a Dispatch mailbox its assignee's.
function memberIdForAddress(roster: TeamActivityRoster, address: string): string | null {
  if (address === `run:${roster.runId}`) {
    return roster.members.find((member) => member.is_manager)?.id ?? null
  }
  if (address.startsWith(DISPATCH_PREFIX)) {
    const dispatchId = address.slice(DISPATCH_PREFIX.length)
    return (
      roster.members.find((member) => member.current_task?.dispatch_id === dispatchId)?.id ?? null
    )
  }
  return teamMemberForHandle(roster.members, address)?.id ?? null
}

function partyFor(memberId: string | null, address: string): string {
  if (memberId) {
    return 'member'
  }
  if (address === 'orca:operator') {
    return 'operator'
  }
  if (address.startsWith('external:')) {
    return 'external'
  }
  return address.startsWith('orca:') ? 'system' : 'agent'
}

function dispatchIdOf(message: TeamLogMessage): string | null {
  const address = [message.from_handle, message.to_handle].find((handle) =>
    handle.startsWith(DISPATCH_PREFIX)
  )
  return address ? address.slice(DISPATCH_PREFIX.length) : null
}

/** One row of the old `orchestration.teamLog` as the event the feed would have carried for it. */
export function legacyTeamActivityEvent(
  message: TeamLogMessage,
  roster: TeamActivityRoster
): TeamActivityEvent {
  const fromMemberId = memberIdForAddress(roster, message.from_handle)
  const toMemberId = memberIdForAddress(roster, message.to_handle)
  return {
    sequence: message.sequence,
    // Its own prefix, so a log row can never be taken for a feed event with the same number.
    id: `msg_${message.id}`,
    kind: 'message',
    channel: 'mailbox',
    status: null,
    message_type: message.type,
    message_id: message.id,
    task_id: null,
    task_ref: null,
    goal_id: null,
    dispatch_id: dispatchIdOf(message),
    thread_id: message.thread_id ?? null,
    from: { party: partyFor(fromMemberId, message.from_handle), member_id: fromMemberId },
    to: {
      party: partyFor(toMemberId, message.to_handle),
      member_ids: toMemberId ? [toMemberId] : []
    },
    subject: message.subject,
    body_preview: message.body ? message.body.slice(0, BODY_PREVIEW_MAX) : null,
    created_at: message.created_at
  }
}

/** The log rows after `afterSequence`, oldest first, shaped as the page the feed would return. */
export function legacyTeamActivityPage(
  messages: readonly TeamLogMessage[],
  roster: TeamActivityRoster,
  afterSequence: number | undefined
): TeamActivityPage {
  const after = afterSequence ?? Number.NEGATIVE_INFINITY
  const events = messages
    .filter((message) => message.sequence > after)
    .map((message) => legacyTeamActivityEvent(message, roster))
    .toSorted((a, b) => a.sequence - b.sequence)
  return {
    events,
    latestSequence: events.at(-1)?.sequence ?? afterSequence ?? 0,
    hasMore: false,
    reset: false
  }
}

export type TeamActivityReadRequest = {
  /** What the log being extended was read from, with its cursor. */
  source: TeamActivitySource | null
  afterSequence: number | null
  signal: AbortSignal
}

export type TeamActivityReader = (request: TeamActivityReadRequest) => Promise<TeamActivityRead>

export type TeamActivityHost = {
  /** Whether the host advertises the feed. A host that cannot be asked answers true. */
  supportsActivity: () => Promise<boolean>
  readActivity: (
    afterSequence: number | undefined,
    signal: AbortSignal
  ) => Promise<TeamActivityPage>
  readLog: (signal: AbortSignal) => Promise<readonly TeamLogMessage[]>
  roster: () => TeamActivityRoster
  /** The host answered that it has no such method. */
  isMethodMissing: (error: unknown) => boolean
  now: () => number
}

/**
 * Reads the feed where the host has one and its message log where it does not. The capability is
 * the first guard; a host that advertises nothing readable, or dropped the method since, is caught
 * by its "no such method" answer. The log is used for a while before asking again, so a host
 * updated in place is picked up without a failed call on every poll.
 */
export function createTeamActivityReader(host: TeamActivityHost): TeamActivityReader {
  let feedSeen = false
  let logUntil = 0
  return async ({ source, afterSequence, signal }) => {
    // A cursor only counts within the source it came from.
    const cursorIn = (next: TeamActivitySource): number | undefined =>
      source === next && afterSequence !== null ? afterSequence : undefined
    if (host.now() >= logUntil) {
      if (feedSeen || (await host.supportsActivity())) {
        try {
          const page = await host.readActivity(cursorIn('activity'), signal)
          feedSeen = true
          return { source: 'activity', page }
        } catch (error) {
          if (!host.isMethodMissing(error)) {
            throw error
          }
          feedSeen = false
        }
      }
      logUntil = host.now() + TEAM_ACTIVITY_LEGACY_RECHECK_MS
    }
    const messages = await host.readLog(signal)
    return {
      source: 'legacy',
      page: legacyTeamActivityPage(messages, host.roster(), cursorIn('legacy'))
    }
  }
}
