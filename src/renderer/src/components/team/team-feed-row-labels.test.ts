import { describe, expect, it } from 'vitest'
import { makeTeamActivityEvent } from './team-activity-test-fixtures'
import { teamActivityPartyLabel } from './team-enum-labels'
import {
  parseTeamEventTime,
  teamFeedBadgeVariant,
  teamFeedRecipientLine,
  teamFeedSenderName,
  teamFeedStatusLabel,
  teamFeedTypeLabel
} from './team-feed-row-labels'
import { makeTeamMember } from './team-snapshot-test-fixtures'

const members = [
  makeTeamMember({ id: 'ada', display_name: 'Ada' }),
  makeTeamMember({ id: 'grace', display_name: 'Grace' }),
  makeTeamMember({ id: 'linus', display_name: 'Linus' })
]

describe('teamFeedTypeLabel', () => {
  it('names a message by its type and any other event by its kind', () => {
    expect(teamFeedTypeLabel(makeTeamActivityEvent(1, { message_type: 'worker_done' }))).toBe(
      'Work finished'
    )
    expect(teamFeedTypeLabel(makeTeamActivityEvent(1, { message_type: null }))).toBe('Message')
    expect(teamFeedTypeLabel(makeTeamActivityEvent(1, { kind: 'dispatch_started' }))).toBe(
      'Work started'
    )
  })

  it('calls a note typed into a terminal a note, and a mailbox delivery a delivery', () => {
    expect(
      teamFeedTypeLabel(makeTeamActivityEvent(1, { kind: 'delivery', channel: 'queue' }))
    ).toBe('Note')
    expect(
      teamFeedTypeLabel(makeTeamActivityEvent(1, { kind: 'delivery', channel: 'direct' }))
    ).toBe('Note')
    expect(
      teamFeedTypeLabel(makeTeamActivityEvent(1, { kind: 'delivery', channel: 'mailbox' }))
    ).toBe('Delivery')
  })

  it('spells out a kind and a message type this build does not know', () => {
    expect(teamFeedTypeLabel(makeTeamActivityEvent(1, { kind: 'budget_alert' }))).toBe(
      'Budget alert'
    )
    expect(teamFeedTypeLabel(makeTeamActivityEvent(1, { message_type: 'peer_review' }))).toBe(
      'Peer review'
    )
  })
})

describe('teamFeedStatusLabel', () => {
  const status = (kind: string, value: string | null): string =>
    teamFeedStatusLabel({ kind, status: value })

  it('adds the status where it says more than the kind', () => {
    expect(status('task_settled', 'completed')).toBe('Done')
    expect(status('task_settled', 'failed')).toBe('Failed')
    expect(status('task_status', 'blocked')).toBe('Blocked')
    expect(status('goal_closed', 'cancelled')).toBe('Cancelled')
    expect(status('member_state', 'running')).toBe('Running')
    expect(status('hire_decided', 'approved')).toBe('Approved')
    expect(status('delivery', 'interrupted')).toBe('Interrupted')
    expect(status('member_paused', 'spend_cap')).toBe('Paused: spend cap reached')
    expect(status('member_paused', null)).toBe('Paused by you')
  })

  it('stays silent where the status only repeats the kind, or is missing', () => {
    expect(status('message', 'sent')).toBe('')
    expect(status('dispatch_started', 'dispatched')).toBe('')
    expect(status('delivery', 'delivered')).toBe('')
    expect(status('task_assigned', null)).toBe('')
  })

  it('shows the status of a kind it does not know, spelled out', () => {
    expect(status('budget_alert', 'over_limit')).toBe('Over limit')
  })
})

describe('teamFeedBadgeVariant', () => {
  it('marks failures, and tells mail from state changes', () => {
    expect(teamFeedBadgeVariant({ kind: 'dispatch_failed', status: 'failed' })).toBe('destructive')
    expect(teamFeedBadgeVariant({ kind: 'task_settled', status: 'failed' })).toBe('destructive')
    expect(teamFeedBadgeVariant({ kind: 'delivery', status: 'failed' })).toBe('destructive')
    expect(teamFeedBadgeVariant({ kind: 'message', status: null })).toBe('secondary')
    expect(teamFeedBadgeVariant({ kind: 'task_settled', status: 'completed' })).toBe('outline')
    expect(teamFeedBadgeVariant({ kind: 'budget_alert', status: null })).toBe('outline')
  })
})

describe('feed names', () => {
  it('names a member by the roster and anyone else by their party', () => {
    const name = (party: string, member_id: string | null): string =>
      teamFeedSenderName({ from: { party, member_id } }, members)

    expect(name('member', 'ada')).toBe('Ada')
    expect(name('member', 'left_the_team')).toBe('Former member')
    expect(name('operator', null)).toBe('You')
    expect(name('external', null)).toBe('Automation')
    expect(name('system', null)).toBe('Orca')
    expect(name('agent', null)).toBe('Another agent')
    expect(name('auditor', null)).toBe('Auditor')
  })

  it('names the first recipients and counts the rest', () => {
    const line = (party: string, member_ids: string[]): string =>
      teamFeedRecipientLine({ to: { party, member_ids } }, members)

    expect(line('member', ['grace'])).toBe('Grace')
    expect(line('member', ['grace', 'linus'])).toBe('Grace, Linus')
    expect(line('member', ['grace', 'linus', 'ada', 'gone'])).toBe('Grace, Linus +2')
    expect(line('team', [])).toBe('Team')
    expect(line('operator', [])).toBe('You')
    expect(line('member', ['gone'])).toBe(teamActivityPartyLabel('member'))
  })
})

describe('parseTeamEventTime', () => {
  it('reads the feed’s ISO time and the old log’s zoneless UTC time alike', () => {
    const expected = Date.UTC(2026, 8, 28, 10, 0, 0)
    expect(parseTeamEventTime('2026-09-28T10:00:00.000Z')).toBe(expected)
    expect(parseTeamEventTime('2026-09-28 10:00:00')).toBe(expected)
    expect(parseTeamEventTime('2026-09-28T12:00:00+02:00')).toBe(expected)
  })

  it('has no time for a value it cannot read', () => {
    expect(parseTeamEventTime('yesterday')).toBeNull()
    expect(parseTeamEventTime('')).toBeNull()
  })
})
