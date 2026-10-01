import { describe, expect, it } from 'vitest'
import {
  clearedTeamActivityLog,
  EMPTY_TEAM_ACTIVITY_LOG,
  liveTeamActivity,
  mergeTeamActivityPage,
  TEAM_ACTIVITY_BUFFER_SIZE,
  type TeamActivityLog
} from './team-activity-merge'
import { makeTeamActivityEvent, makeTeamActivityPage } from './team-activity-test-fixtures'

function feed(log: TeamActivityLog, sequences: number[], arrivedAt: number, latest?: number) {
  return mergeTeamActivityPage(
    log,
    {
      source: 'activity',
      page: makeTeamActivityPage(
        sequences.map((sequence) => makeTeamActivityEvent(sequence)),
        latest === undefined ? {} : { latestSequence: latest }
      )
    },
    arrivedAt
  )
}

const sequencesOf = (log: TeamActivityLog): number[] =>
  log.entries.map((entry) => entry.event.sequence)

describe('mergeTeamActivityPage', () => {
  it('holds the first page as history and adds none of it to the live events', () => {
    const { log, fresh } = feed(EMPTY_TEAM_ACTIVITY_LOG, [1, 2, 3], 1_000)

    expect(sequencesOf(log)).toEqual([1, 2, 3])
    expect(log.entries.every((entry) => entry.history)).toBe(true)
    expect(log.cursor).toBe(3)
    expect(fresh).toEqual([])
    expect(liveTeamActivity(log)).toEqual([])
  })

  it('marks an empty first page as landed, so the next page is live', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [], 1_000).log
    expect(first.cursor).toBe(0)

    const { log, fresh } = feed(first, [1], 2_000)
    expect(fresh.map((entry) => entry.event.sequence)).toEqual([1])
    expect(log.entries[0]).toMatchObject({ history: false, arrivedAt: 2_000 })
  })

  it('appends later pages as live events stamped with when they arrived', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [1, 2], 1_000).log
    const { log, fresh } = feed(first, [3, 4], 5_000)

    expect(sequencesOf(log)).toEqual([1, 2, 3, 4])
    expect(log.cursor).toBe(4)
    expect(fresh.map((entry) => entry.event.sequence)).toEqual([3, 4])
    expect(liveTeamActivity(log)).toEqual(fresh)
    expect(fresh.every((entry) => entry.arrivedAt === 5_000 && !entry.history)).toBe(true)
    // History stays history however many pages follow.
    expect(log.entries.slice(0, 2).every((entry) => entry.history)).toBe(true)
  })

  it('follows the page cursor past events it did not carry', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [1], 0).log
    expect(feed(first, [], 0, 9).log.cursor).toBe(9)
    // The cursor never moves backwards on an out-of-date answer.
    expect(feed(feed(first, [], 0, 9).log, [], 0, 4).log.cursor).toBe(9)
  })

  it('returns the same log when a page changes nothing', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [1], 0).log
    expect(feed(first, [], 10).log).toBe(first)
  })

  it('drops an event at or before the cursor and one it already holds', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [5, 6], 0).log
    const { log, fresh } = feed(first, [4, 6, 7], 10)

    expect(sequencesOf(log)).toEqual([5, 6, 7])
    expect(fresh.map((entry) => entry.event.sequence)).toEqual([7])
  })

  it('keeps a group send as one entry when its sequence moves to a later recipient', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [1], 0).log
    const sent = makeTeamActivityEvent(2, { to: { party: 'member', member_ids: ['member_2'] } })
    const live = mergeTeamActivityPage(
      first,
      { source: 'activity', page: makeTeamActivityPage([sent, makeTeamActivityEvent(3)]) },
      1_000
    ).log
    const grown = {
      ...sent,
      sequence: 4,
      to: { party: 'member', member_ids: ['member_2', 'member_3'] }
    }
    const { log, fresh } = mergeTeamActivityPage(
      live,
      { source: 'activity', page: makeTeamActivityPage([grown]) },
      9_000
    )

    expect(log.entries.map((entry) => entry.event.id)).toEqual(['act_1', 'act_3', 'act_2'])
    expect(log.entries.at(-1)).toMatchObject({
      event: { sequence: 4, to: { member_ids: ['member_2', 'member_3'] } },
      // Still when it was first seen: an event is acted out once.
      arrivedAt: 1_000,
      history: false
    })
    expect(fresh).toEqual([])
    expect(log.cursor).toBe(4)
  })

  it('keeps only the newest events once the buffer is full', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [1], 0).log
    const many = Array.from({ length: TEAM_ACTIVITY_BUFFER_SIZE + 20 }, (_, index) => index + 2)
    const { log } = feed(first, many, 10)

    expect(log.entries).toHaveLength(TEAM_ACTIVITY_BUFFER_SIZE)
    expect(log.entries[0].event.sequence).toBe(22)
    expect(log.entries.at(-1)?.event.sequence).toBe(TEAM_ACTIVITY_BUFFER_SIZE + 21)
  })

  it('caps an oversized first page too', () => {
    const many = Array.from({ length: TEAM_ACTIVITY_BUFFER_SIZE + 5 }, (_, index) => index + 1)
    expect(feed(EMPTY_TEAM_ACTIVITY_LOG, many, 0).log.entries).toHaveLength(
      TEAM_ACTIVITY_BUFFER_SIZE
    )
  })

  it('replaces what it holds on a reset page, as history under a new epoch', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [1, 2], 0).log
    const live = feed(first, [3], 10).log
    const { log, fresh } = mergeTeamActivityPage(
      live,
      {
        source: 'activity',
        page: makeTeamActivityPage([makeTeamActivityEvent(40), makeTeamActivityEvent(41)], {
          reset: true
        })
      },
      20
    )

    expect(sequencesOf(log)).toEqual([40, 41])
    expect(log.entries.every((entry) => entry.history)).toBe(true)
    expect(fresh).toEqual([])
    expect(log.cursor).toBe(41)
    expect(log.epoch).toBe(live.epoch + 1)
  })

  it('accepts a reset whose cursor is lower than the one it held', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [90], 0).log
    const { log } = mergeTeamActivityPage(
      first,
      {
        source: 'activity',
        page: makeTeamActivityPage([makeTeamActivityEvent(2)], { reset: true })
      },
      10
    )
    expect(log.cursor).toBe(2)
  })

  it('starts over when the source changes, because the sequences are not comparable', () => {
    const legacy = mergeTeamActivityPage(
      EMPTY_TEAM_ACTIVITY_LOG,
      { source: 'legacy', page: makeTeamActivityPage([makeTeamActivityEvent(700)]) },
      0
    ).log
    const { log, fresh } = feed(legacy, [3], 10)

    expect(sequencesOf(log)).toEqual([3])
    expect(log.source).toBe('activity')
    expect(log.entries[0].history).toBe(true)
    expect(fresh).toEqual([])
    expect(log.epoch).toBe(legacy.epoch + 1)
  })

  it('clears to an empty log under a new epoch', () => {
    const first = feed(EMPTY_TEAM_ACTIVITY_LOG, [1], 0).log
    expect(clearedTeamActivityLog(first)).toEqual({
      entries: [],
      cursor: null,
      source: null,
      epoch: first.epoch + 1
    })
  })
})
