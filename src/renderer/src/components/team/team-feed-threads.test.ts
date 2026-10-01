import { describe, expect, it } from 'vitest'
import { makeTeamActivityEntry } from './team-activity-test-fixtures'
import {
  buildTeamFeedRows,
  countUnseenTeamFeedRows,
  filterTeamFeedRows,
  isTeamFeedFamilyFilter,
  teamActivityMemberIds,
  teamFeedFamily,
  teamMailRows,
  UNFILTERED_TEAM_FEED,
  type TeamFeedRow
} from './team-feed-threads'

const ids = (rows: readonly TeamFeedRow[]): string[] => rows.map((row) => row.entry.event.id)

const receipt = (sequence: number, messageId: string) =>
  makeTeamActivityEntry(sequence, {
    kind: 'delivery',
    status: 'read',
    message_id: messageId,
    from: { party: 'system', member_id: null }
  })

describe('teamFeedFamily', () => {
  it('sorts every kind the host emits today', () => {
    expect(['message', 'delivery'].map(teamFeedFamily)).toEqual(['mail', 'mail'])
    expect(
      [
        'task_created',
        'task_assigned',
        'task_status',
        'task_settled',
        'dispatch_started',
        'dispatch_failed',
        'goal_created',
        'goal_review',
        'goal_closed',
        'gate_opened',
        'gate_resolved'
      ].map(teamFeedFamily)
    ).toEqual(Array.from({ length: 11 }, () => 'work'))
    expect(
      [
        'hire_proposed',
        'hire_decided',
        'member_added',
        'member_state',
        'member_paused',
        'member_resumed'
      ].map(teamFeedFamily)
    ).toEqual(Array.from({ length: 6 }, () => 'people'))
  })

  it('files a kind a newer host adds with its siblings, and an unrelated one nowhere', () => {
    expect(teamFeedFamily('task_reopened')).toBe('work')
    expect(teamFeedFamily('member_promoted')).toBe('people')
    expect(teamFeedFamily('budget_alert')).toBeNull()
    // A prefix is a whole word: `tasks` is not `task_`.
    expect(teamFeedFamily('tasks')).toBeNull()
  })

  it('knows its own filter values', () => {
    expect(['all', 'mail', 'work', 'people'].every(isTeamFeedFamilyFilter)).toBe(true)
    expect(isTeamFeedFamilyFilter('')).toBe(false)
    expect(isTeamFeedFamilyFilter('other')).toBe(false)
  })
})

describe('teamActivityMemberIds', () => {
  it('names the sender then the recipients, each once', () => {
    expect(
      teamActivityMemberIds({
        from: { party: 'member', member_id: 'a' },
        to: { party: 'member', member_ids: ['b', 'a', 'c'] }
      })
    ).toEqual(['a', 'b', 'c'])
    expect(
      teamActivityMemberIds({
        from: { party: 'operator', member_id: null },
        to: { party: 'team', member_ids: [] }
      })
    ).toEqual([])
  })
})

describe('buildTeamFeedRows', () => {
  it('counts the messages of a thread and leaves everything else alone', () => {
    const rows = buildTeamFeedRows([
      makeTeamActivityEntry(1, { thread_id: 't1' }),
      makeTeamActivityEntry(2, { thread_id: 't2' }),
      makeTeamActivityEntry(3, { thread_id: 't1' }),
      makeTeamActivityEntry(4),
      // A task event on a thread is not one of its messages.
      makeTeamActivityEntry(5, { kind: 'task_settled', thread_id: 't1' })
    ])

    expect(rows.map((row) => row.threadSize)).toEqual([2, 1, 2, 1, 1])
  })

  it('folds a read receipt into its message instead of showing it as a row', () => {
    const rows = buildTeamFeedRows([
      makeTeamActivityEntry(1, { message_id: 'm1' }),
      makeTeamActivityEntry(2, { message_id: 'm2' }),
      receipt(3, 'm1'),
      // The message this one is about has already left the buffer.
      receipt(4, 'gone')
    ])

    expect(ids(rows)).toEqual(['act_1', 'act_2'])
    expect(rows.map((row) => row.read)).toEqual([true, false])
  })

  it('claims nothing about a group send from one recipient having read it', () => {
    const rows = buildTeamFeedRows([
      makeTeamActivityEntry(1, {
        message_id: 'm1',
        to: { party: 'member', member_ids: ['member_2', 'member_3'] }
      }),
      receipt(2, 'm1')
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].read).toBe(false)
  })

  it('keeps a delivered note as a row: it is the operator talking, not a receipt', () => {
    const rows = buildTeamFeedRows([
      makeTeamActivityEntry(1, { kind: 'delivery', channel: 'queue', status: 'delivered' }),
      makeTeamActivityEntry(2, { kind: 'delivery', channel: 'direct', status: 'interrupted' }),
      // A mailbox delivery with a status this build does not know is not assumed to be a receipt.
      makeTeamActivityEntry(3, { kind: 'delivery', channel: 'mailbox', status: 'bounced' })
    ])
    expect(ids(rows)).toEqual(['act_1', 'act_2', 'act_3'])
  })
})

describe('filterTeamFeedRows', () => {
  const rows = buildTeamFeedRows([
    makeTeamActivityEntry(1, { thread_id: 't1' }),
    makeTeamActivityEntry(2, {
      kind: 'dispatch_started',
      from: { party: 'member', member_id: 'lead' },
      to: { party: 'member', member_ids: ['member_3'] }
    }),
    makeTeamActivityEntry(3, {
      kind: 'member_paused',
      from: { party: 'operator', member_id: null },
      to: { party: 'member', member_ids: ['member_3'] }
    }),
    makeTeamActivityEntry(4, { kind: 'budget_alert' }),
    makeTeamActivityEntry(5, {
      thread_id: 't1',
      from: { party: 'member', member_id: 'member_2' },
      to: { party: 'member', member_ids: ['member_1'] }
    })
  ])

  it('shows everything, a kind it cannot place included, when nothing is filtered', () => {
    expect(ids(filterTeamFeedRows(rows, UNFILTERED_TEAM_FEED))).toEqual([
      'act_1',
      'act_2',
      'act_3',
      'act_4',
      'act_5'
    ])
  })

  it('filters by family', () => {
    const by = (family: 'mail' | 'work' | 'people') =>
      ids(filterTeamFeedRows(rows, { ...UNFILTERED_TEAM_FEED, family }))
    expect(by('mail')).toEqual(['act_1', 'act_5'])
    expect(by('work')).toEqual(['act_2'])
    expect(by('people')).toEqual(['act_3'])
  })

  it('filters by a member on either end, together with the family', () => {
    expect(
      ids(filterTeamFeedRows(rows, { ...UNFILTERED_TEAM_FEED, memberId: 'member_3' }))
    ).toEqual(['act_2', 'act_3'])
    expect(
      ids(filterTeamFeedRows(rows, { family: 'people', memberId: 'member_3', threadId: null }))
    ).toEqual(['act_3'])
  })

  it('shows a whole thread whatever else is selected', () => {
    expect(
      ids(filterTeamFeedRows(rows, { family: 'people', memberId: 'member_3', threadId: 't1' }))
    ).toEqual(['act_1', 'act_5'])
  })
})

describe('teamMailRows', () => {
  const rows = buildTeamFeedRows([
    makeTeamActivityEntry(1),
    makeTeamActivityEntry(2, { from: { party: 'operator', member_id: null } }),
    makeTeamActivityEntry(3, { from: { party: 'external', member_id: null } }),
    makeTeamActivityEntry(4, { from: { party: 'system', member_id: null } }),
    makeTeamActivityEntry(5, { from: { party: 'agent', member_id: null } }),
    makeTeamActivityEntry(6, { kind: 'task_settled' }),
    makeTeamActivityEntry(7, {
      kind: 'delivery',
      channel: 'queue',
      status: 'delivered',
      from: { party: 'operator', member_id: null },
      to: { party: 'member', member_ids: ['member_9'] }
    })
  ])

  it('separates outside mail from what agents wrote to each other', () => {
    expect(ids(teamMailRows(rows, { kind: 'between-agents' }))).toEqual(['act_1', 'act_5'])
    expect(ids(teamMailRows(rows, { kind: 'from-outside' }))).toEqual([
      'act_2',
      'act_3',
      'act_4',
      'act_7'
    ])
  })

  it('leaves out everything that is not mail', () => {
    expect(ids(teamMailRows(rows, { kind: 'all' }))).not.toContain('act_6')
    expect(teamMailRows(rows, { kind: 'all' })).toHaveLength(6)
  })

  it("lists one member's mail, sent or received", () => {
    expect(ids(teamMailRows(rows, { kind: 'member', memberId: 'member_9' }))).toEqual(['act_7'])
    expect(teamMailRows(rows, { kind: 'member', memberId: 'member_2' })).toHaveLength(5)
  })
})

describe('countUnseenTeamFeedRows', () => {
  it('counts the rows after the last one the reader saw', () => {
    const rows = buildTeamFeedRows([1, 2, 3, 4].map((sequence) => makeTeamActivityEntry(sequence)))
    expect(countUnseenTeamFeedRows(rows, 2)).toBe(2)
    expect(countUnseenTeamFeedRows(rows, 4)).toBe(0)
    expect(countUnseenTeamFeedRows(rows, 0)).toBe(4)
  })
})
