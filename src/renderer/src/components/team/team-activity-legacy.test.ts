import { describe, expect, it, vi } from 'vitest'
import {
  createTeamActivityReader,
  legacyTeamActivityEvent,
  legacyTeamActivityPage,
  TEAM_ACTIVITY_LEGACY_RECHECK_MS,
  type TeamActivityHost,
  type TeamActivityRoster
} from './team-activity-legacy'
import { makeTeamActivityEvent, makeTeamActivityPage } from './team-activity-test-fixtures'
import { makeTeamMember } from './team-snapshot-test-fixtures'
import type { TeamLogMessage } from './team-snapshot-types'

const roster: TeamActivityRoster = {
  runId: 'run_1',
  members: [
    makeTeamMember({ id: 'lead', is_manager: 1, live_handle: 'term_lead' }),
    makeTeamMember({
      id: 'ada',
      live_handle: 'term_ada',
      current_task: { task_id: 'task_1', ref: 'bmt-1', dispatch_id: 'dispatch_9' }
    }),
    makeTeamMember({ id: 'grace', live_handle: null })
  ]
}

function message(sequence: number, overrides: Partial<TeamLogMessage> = {}): TeamLogMessage {
  return {
    id: `m${sequence}`,
    from_handle: 'term_ada',
    to_handle: 'term_lead',
    subject: `Subject ${sequence}`,
    body: '',
    type: 'status',
    priority: 'normal',
    sequence,
    created_at: '2026-09-28 10:00:00',
    ...overrides
  }
}

describe('legacyTeamActivityEvent', () => {
  it('maps a log row to the message event the feed would carry', () => {
    const event = legacyTeamActivityEvent(
      message(7, { type: 'worker_done', body: 'All green.', thread_id: 'thread_1' }),
      roster
    )

    expect(event).toEqual({
      sequence: 7,
      id: 'msg_m7',
      kind: 'message',
      channel: 'mailbox',
      status: null,
      message_type: 'worker_done',
      message_id: 'm7',
      task_id: null,
      task_ref: null,
      goal_id: null,
      dispatch_id: null,
      thread_id: 'thread_1',
      from: { party: 'member', member_id: 'ada' },
      to: { party: 'member', member_ids: ['lead'] },
      subject: 'Subject 7',
      body_preview: 'All green.',
      created_at: '2026-09-28 10:00:00'
    })
  })

  it('reads the Run mailbox as the manager and a Dispatch mailbox as its assignee', () => {
    const toRun = legacyTeamActivityEvent(message(1, { to_handle: 'run:run_1' }), roster)
    expect(toRun.to).toEqual({ party: 'member', member_ids: ['lead'] })

    const fromDispatch = legacyTeamActivityEvent(
      message(2, { from_handle: 'dispatch:dispatch_9' }),
      roster
    )
    expect(fromDispatch.from).toEqual({ party: 'member', member_id: 'ada' })
    expect(fromDispatch.dispatch_id).toBe('dispatch_9')
  })

  it('names the party of an address that is not a member', () => {
    const party = (from_handle: string): string =>
      legacyTeamActivityEvent(message(1, { from_handle }), roster).from.party

    expect(party('orca:operator')).toBe('operator')
    expect(party('orca:breaker')).toBe('system')
    expect(party('external:webhook')).toBe('external')
    expect(party('term_someone_else')).toBe('agent')
    expect(party('run:another_run')).toBe('agent')
  })

  it('leaves the recipient list empty when the address reaches no member', () => {
    const event = legacyTeamActivityEvent(message(1, { to_handle: 'orca:operator' }), roster)
    expect(event.to).toEqual({ party: 'operator', member_ids: [] })
  })

  it('cuts the body to a preview and has none for an empty body', () => {
    expect(
      legacyTeamActivityEvent(message(1, { body: 'x'.repeat(400) }), roster).body_preview
    ).toHaveLength(280)
    expect(legacyTeamActivityEvent(message(1), roster).body_preview).toBeNull()
  })
})

describe('legacyTeamActivityPage', () => {
  // The host returns the log newest first.
  const log = [message(12), message(11), message(10)]

  it('returns every row oldest first without a cursor', () => {
    const page = legacyTeamActivityPage(log, roster, undefined)
    expect(page.events.map((event) => event.sequence)).toEqual([10, 11, 12])
    expect(page).toMatchObject({ latestSequence: 12, hasMore: false, reset: false })
  })

  it('returns only the rows after the cursor and keeps the cursor when there are none', () => {
    expect(legacyTeamActivityPage(log, roster, 11).events.map((event) => event.id)).toEqual([
      'msg_m12'
    ])
    expect(legacyTeamActivityPage(log, roster, 12)).toMatchObject({
      events: [],
      latestSequence: 12
    })
    expect(legacyTeamActivityPage([], roster, undefined).latestSequence).toBe(0)
  })
})

function makeHost(
  given: { supportsActivity?: boolean; readActivity?: TeamActivityHost['readActivity'] } = {}
) {
  const activityPage = makeTeamActivityPage([makeTeamActivityEvent(5)])
  const host = {
    supportsActivity: vi.fn<TeamActivityHost['supportsActivity']>(
      async () => given.supportsActivity ?? true
    ),
    readActivity: vi.fn<TeamActivityHost['readActivity']>(
      given.readActivity ?? (async () => activityPage)
    ),
    readLog: vi.fn<TeamActivityHost['readLog']>(async () => [message(12), message(11)]),
    roster: () => roster,
    isMethodMissing: (error: unknown) =>
      error instanceof Error && error.message === 'method_not_found',
    now: vi.fn<TeamActivityHost['now']>(() => 0)
  } satisfies TeamActivityHost
  return { host, read: createTeamActivityReader(host) }
}

const failing = (code: string) => async (): Promise<never> => {
  throw new Error(code)
}

const signal = new AbortController().signal
const start = { source: null, afterSequence: null, signal }

describe('createTeamActivityReader', () => {
  it('reads the feed when the host advertises it, without touching the log', async () => {
    const { host, read } = makeHost()

    expect(await read(start)).toMatchObject({ source: 'activity', page: { latestSequence: 5 } })
    expect(host.readActivity).toHaveBeenCalledWith(undefined, signal)
    expect(host.readLog).not.toHaveBeenCalled()
  })

  it('passes the cursor on and stops asking for the capability once the feed answered', async () => {
    const { host, read } = makeHost()
    await read(start)
    await read({ source: 'activity', afterSequence: 5, signal })

    expect(host.readActivity).toHaveBeenLastCalledWith(5, signal)
    expect(host.supportsActivity).toHaveBeenCalledTimes(1)
  })

  it('falls back to the log when the capability is absent, without calling the feed', async () => {
    const { host, read } = makeHost({ supportsActivity: false })

    const result = await read(start)
    expect(result.source).toBe('legacy')
    expect(result.page.events.map((event) => event.id)).toEqual(['msg_m11', 'msg_m12'])
    expect(host.readActivity).not.toHaveBeenCalled()
  })

  it('falls back to the log when the host answers that the method does not exist', async () => {
    const { host, read } = makeHost({ readActivity: failing('method_not_found') })

    expect((await read(start)).source).toBe('legacy')
    expect(host.readLog).toHaveBeenCalledTimes(1)
  })

  it('lets any other failure through instead of reading the log', async () => {
    const { host, read } = makeHost({ readActivity: failing('runtime_timeout') })

    await expect(read(start)).rejects.toThrow('runtime_timeout')
    expect(host.readLog).not.toHaveBeenCalled()
  })

  it('never carries a feed cursor into the log, or a log cursor into the feed', async () => {
    const { host, read } = makeHost({ supportsActivity: false })

    const fromFeedCursor = await read({ source: 'activity', afterSequence: 11, signal })
    expect(fromFeedCursor.page.events).toHaveLength(2)

    const fromLogCursor = await read({ source: 'legacy', afterSequence: 11, signal })
    expect(fromLogCursor.page.events.map((event) => event.sequence)).toEqual([12])

    host.supportsActivity.mockResolvedValue(true)
    host.now.mockReturnValue(TEAM_ACTIVITY_LEGACY_RECHECK_MS)
    await read({ source: 'legacy', afterSequence: 12, signal })
    expect(host.readActivity).toHaveBeenLastCalledWith(undefined, signal)
  })

  it('stays on the log between rechecks, then picks up a host that gained the feed', async () => {
    const { host, read } = makeHost({ supportsActivity: false })
    await read(start)

    host.now.mockReturnValue(TEAM_ACTIVITY_LEGACY_RECHECK_MS - 1)
    host.supportsActivity.mockResolvedValue(true)
    expect((await read(start)).source).toBe('legacy')
    expect(host.supportsActivity).toHaveBeenCalledTimes(1)

    host.now.mockReturnValue(TEAM_ACTIVITY_LEGACY_RECHECK_MS)
    expect((await read(start)).source).toBe('activity')
  })

  it('goes back to the log if the feed disappears after it had answered', async () => {
    const { host, read } = makeHost()
    await read(start)

    host.readActivity.mockRejectedValue(new Error('method_not_found'))
    expect((await read({ source: 'activity', afterSequence: 5, signal })).source).toBe('legacy')
  })
})
