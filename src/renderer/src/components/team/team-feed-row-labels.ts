import { translate } from '@/i18n/i18n'
import type { TeamActivityEvent } from '../../../../shared/team-activity-event'
import {
  readableTeamEnumValue,
  teamActivityKindLabel,
  teamActivityPartyLabel,
  teamMessageTypeLabel,
  teamPauseReasonLabel,
  teamTaskStatusLabel
} from './team-enum-labels'
import { teamFeedFamily } from './team-feed-threads'
import type { TeamMember } from './team-snapshot-types'

// A note the operator or a trigger put in front of a member, typed into its terminal.
const NOTE_CHANNELS = new Set(['queue', 'direct'])

/** The word on a row's badge. A kind this build does not know reads as its own name, spelled out. */
export function teamFeedTypeLabel(
  event: Pick<TeamActivityEvent, 'kind' | 'message_type' | 'channel'>
): string {
  if (event.kind === 'message') {
    return teamMessageTypeLabel(event.message_type) || teamActivityKindLabel(event.kind)
  }
  if (event.kind === 'delivery' && NOTE_CHANNELS.has(event.channel ?? '')) {
    return translate('team.feed.type.note', 'Note')
  }
  return teamActivityKindLabel(event.kind)
}

const TASK_STATUS_KINDS = new Set(['task_status', 'task_settled', 'goal_closed'])
// Kinds whose status only repeats what the kind already says.
const STATUS_ADDS_NOTHING = new Set([
  'message',
  'task_created',
  'goal_created',
  'goal_review',
  'dispatch_started',
  'dispatch_failed',
  'gate_opened',
  'hire_proposed',
  'member_added',
  'member_resumed'
])

/** What the event's status adds to its kind, or nothing. */
export function teamFeedStatusLabel(event: Pick<TeamActivityEvent, 'kind' | 'status'>): string {
  if (event.kind === 'member_paused') {
    return teamPauseReasonLabel(event.status)
  }
  if (!event.status || STATUS_ADDS_NOTHING.has(event.kind)) {
    return ''
  }
  if (event.kind === 'delivery' && event.status === 'delivered') {
    return ''
  }
  return TASK_STATUS_KINDS.has(event.kind)
    ? teamTaskStatusLabel(event.status)
    : readableTeamEnumValue(event.status)
}

export type TeamFeedBadgeVariant = 'secondary' | 'outline' | 'destructive'

export function teamFeedBadgeVariant(
  event: Pick<TeamActivityEvent, 'kind' | 'status'>
): TeamFeedBadgeVariant {
  if (event.kind === 'dispatch_failed' || event.status === 'failed') {
    return 'destructive'
  }
  return teamFeedFamily(event.kind) === 'mail' ? 'secondary' : 'outline'
}

function memberName(members: readonly TeamMember[], id: string | null): string | undefined {
  return id ? members.find((member) => member.id === id)?.display_name : undefined
}

export function teamFeedSenderName(
  event: Pick<TeamActivityEvent, 'from'>,
  members: readonly TeamMember[]
): string {
  return memberName(members, event.from.member_id) ?? teamActivityPartyLabel(event.from.party)
}

const RECIPIENTS_NAMED = 2

/** Who an event went to, in a few words: the first names, then how many more. */
export function teamFeedRecipientLine(
  event: Pick<TeamActivityEvent, 'to'>,
  members: readonly TeamMember[]
): string {
  const ids = event.to.member_ids
  if (ids.length === 0) {
    return teamActivityPartyLabel(event.to.party)
  }
  const named = ids
    .slice(0, RECIPIENTS_NAMED)
    .map((id) => memberName(members, id) ?? teamActivityPartyLabel('member'))
    .join(', ')
  return ids.length > RECIPIENTS_NAMED
    ? translate('team.feed.recipientsAndMore', '{{names}} +{{count}}', {
        names: named,
        count: ids.length - RECIPIENTS_NAMED
      })
    : named
}

/**
 * When an event happened, in milliseconds. Activity rows carry an ISO time with its zone; rows
 * mapped from the old message log carry SQLite's `YYYY-MM-DD HH:MM:SS`, which is UTC without saying so.
 */
export function parseTeamEventTime(value: string): number | null {
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  const parsed = Date.parse(zoned ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isFinite(parsed) ? parsed : null
}
