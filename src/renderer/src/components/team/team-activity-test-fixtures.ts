import type { TeamActivityEvent, TeamActivityPage } from '../../../../shared/team-activity-event'
import type { TeamActivityEntry } from './team-activity-merge'

/** A message from member_1 to member_2 at `sequence`, named the way the host names events. */
export function makeTeamActivityEvent(
  sequence: number,
  overrides: Partial<TeamActivityEvent> = {}
): TeamActivityEvent {
  return {
    sequence,
    id: `act_${sequence}`,
    kind: 'message',
    channel: 'mailbox',
    status: null,
    message_type: 'status',
    message_id: `msg_${sequence}`,
    task_id: null,
    task_ref: null,
    goal_id: null,
    dispatch_id: null,
    thread_id: null,
    from: { party: 'member', member_id: 'member_1' },
    to: { party: 'member', member_ids: ['member_2'] },
    subject: `Subject ${sequence}`,
    body_preview: null,
    created_at: '2026-09-28T10:00:00.000Z',
    ...overrides
  }
}

export function makeTeamActivityPage(
  events: TeamActivityEvent[],
  overrides: Partial<TeamActivityPage> = {}
): TeamActivityPage {
  return {
    events,
    latestSequence: events.at(-1)?.sequence ?? 0,
    hasMore: false,
    reset: false,
    ...overrides
  }
}

export function makeTeamActivityEntry(
  sequence: number,
  overrides: Partial<TeamActivityEvent> = {}
): TeamActivityEntry {
  return { event: makeTeamActivityEvent(sequence, overrides), history: false, arrivedAt: 0 }
}
