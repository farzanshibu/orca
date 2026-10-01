import { describe, expect, it, vi } from 'vitest'
import {
  INITIAL_TEAM_PAGE_MODEL,
  loadTeamPage,
  reduceTeamPage,
  type TeamPageEvent,
  type TeamPageModel,
  type TeamPageSource
} from './team-page-model'
import { makeTeamSnapshot } from './team-snapshot-test-fixtures'
import type { TeamListEntry, TeamSnapshot } from './team-snapshot-types'

function listEntry(id: string): TeamListEntry {
  return { ...makeTeamSnapshot().team, id, name: id, memberCount: 0, pendingHires: 0 }
}

function snapshotOf(id: string): TeamSnapshot {
  const snapshot = makeTeamSnapshot()
  return { ...snapshot, team: { ...snapshot.team, id, name: id } }
}

function loaded(generation: number, teamId: string): TeamPageEvent {
  return {
    type: 'loaded',
    generation,
    teams: [listEntry('team_a'), listEntry('team_b')],
    selectedTeamId: teamId,
    snapshot: snapshotOf(teamId),
    log: []
  }
}

function requested(generation: number, scope = 'local:repo_1'): TeamPageEvent {
  return { type: 'requested', generation, scope }
}

function run(events: TeamPageEvent[], from: TeamPageModel = INITIAL_TEAM_PAGE_MODEL) {
  return events.reduce(reduceTeamPage, from)
}

describe('reduceTeamPage: stale responses', () => {
  it('applies the response to the newest request', () => {
    const model = run([requested(1), loaded(1, 'team_a')])
    expect(model.loaded).toBe(true)
    expect(model.snapshot?.team.id).toBe('team_a')
  })

  it('drops a response that a newer request superseded, whichever lands first', () => {
    const newerFirst = run([requested(1), requested(2), loaded(2, 'team_b'), loaded(1, 'team_a')])
    expect(newerFirst.snapshot?.team.id).toBe('team_b')

    const olderFirst = run([requested(1), requested(2), loaded(1, 'team_a')])
    expect(olderFirst.snapshot).toBeNull()
    expect(olderFirst.loaded).toBe(false)
  })

  it('drops a failure from a superseded request', () => {
    const model = run([
      requested(1),
      requested(2),
      loaded(2, 'team_a'),
      { type: 'load-failed', generation: 1, message: 'timed out' }
    ])
    expect(model.connectionError).toBeNull()
  })

  it('clears the old team at once on a switch and ignores its late response', () => {
    const model = run([
      requested(1),
      loaded(1, 'team_a'),
      requested(2),
      { type: 'team-selected', generation: 3, teamId: 'team_b' }
    ])
    expect(model.selectedTeamId).toBe('team_b')
    expect(model.snapshot).toBeNull()
    expect(model.log).toEqual([])
    expect(model.teams.map((team) => team.id)).toEqual(['team_a', 'team_b'])

    const late = reduceTeamPage(model, loaded(2, 'team_a'))
    expect(late.snapshot).toBeNull()
    expect(late.selectedTeamId).toBe('team_b')
  })

  it('keeps the snapshot when the selected team is picked again', () => {
    const before = run([requested(1), loaded(1, 'team_a')])
    expect(reduceTeamPage(before, { type: 'team-selected', generation: 2, teamId: 'team_a' })).toBe(
      before
    )
  })

  it('forgets the previous repository as soon as another one is requested', () => {
    const model = run([
      requested(1),
      loaded(1, 'team_a'),
      requested(2, 'local:repo_2'),
      loaded(1, 'team_a')
    ])
    expect(model.loaded).toBe(false)
    expect(model.teams).toEqual([])
    expect(model.selectedTeamId).toBeNull()
    expect(model.snapshot).toBeNull()
  })
})

describe('reduceTeamPage: errors', () => {
  const ready = run([requested(1), loaded(1, 'team_a')])

  it('keeps the floor as it was when a refresh fails', () => {
    const model = run(
      [requested(2), { type: 'load-failed', generation: 2, message: 'socket closed' }],
      ready
    )
    expect(model.connectionError).toBe('socket closed')
    expect(model.snapshot).toBe(ready.snapshot)
    expect(model.teams).toBe(ready.teams)
    expect(model.actionError).toBeNull()
  })

  it('clears the connection error on the next good refresh', () => {
    const model = run(
      [
        requested(2),
        { type: 'load-failed', generation: 2, message: 'socket closed' },
        requested(3),
        loaded(3, 'team_a')
      ],
      ready
    )
    expect(model.connectionError).toBeNull()
  })

  it('keeps an action error across refreshes until it is dismissed', () => {
    const failed = run(
      [
        { type: 'action-started', key: 'action' },
        { type: 'action-settled', key: 'action', error: 'Member is busy.' },
        requested(2),
        loaded(2, 'team_a'),
        requested(3),
        { type: 'load-failed', generation: 3, message: 'socket closed' }
      ],
      ready
    )
    expect(failed.actionError).toBe('Member is busy.')
    expect(failed.connectionError).toBe('socket closed')
    expect(reduceTeamPage(failed, { type: 'action-error-dismissed' }).actionError).toBeNull()
  })

  it('keeps an earlier action error when a later action succeeds', () => {
    const model = run(
      [
        { type: 'action-settled', key: 'a', error: 'First failed.' },
        { type: 'action-started', key: 'b' },
        { type: 'action-settled', key: 'b', error: null }
      ],
      ready
    )
    expect(model.actionError).toBe('First failed.')
  })
})

describe('reduceTeamPage: pending actions', () => {
  it('tracks each call until it settles', () => {
    const started = run([
      { type: 'action-started', key: 'answer' },
      { type: 'action-started', key: 'answer' },
      { type: 'action-started', key: 'pause' }
    ])
    expect(started.pendingActions).toEqual(['answer', 'answer', 'pause'])
    const one = reduceTeamPage(started, { type: 'action-settled', key: 'answer', error: null })
    expect(one.pendingActions).toEqual(['answer', 'pause'])
    const none = run(
      [
        { type: 'action-settled', key: 'pause', error: 'nope' },
        { type: 'action-settled', key: 'answer', error: null }
      ],
      one
    )
    expect(none.pendingActions).toEqual([])
  })
})

describe('loadTeamPage', () => {
  function source(overrides: Partial<TeamPageSource> = {}): TeamPageSource {
    return {
      listTeams: vi.fn(async () => ({ teams: [listEntry('team_a'), listEntry('team_b')] })),
      showTeam: vi.fn(async (teamId: string) => snapshotOf(teamId)),
      readTeamLog: vi.fn(async () => ({ messages: [] })),
      ...overrides
    }
  }

  it('loads the preferred team, or the first when it is gone', async () => {
    const preferred = await loadTeamPage(source(), 'team_b', () => true)
    expect(preferred?.selectedTeamId).toBe('team_b')
    expect(preferred?.snapshot?.team.id).toBe('team_b')
    const fallback = await loadTeamPage(source(), 'team_deleted', () => true)
    expect(fallback?.selectedTeamId).toBe('team_a')
  })

  it('returns no team without asking for one when the repository has none', async () => {
    const empty = source({ listTeams: vi.fn(async () => ({ teams: [] })) })
    await expect(loadTeamPage(empty, 'team_a', () => true)).resolves.toEqual({
      teams: [],
      selectedTeamId: null,
      snapshot: null,
      log: []
    })
    expect(empty.showTeam).not.toHaveBeenCalled()
  })

  it('stops after the list when a newer request superseded it', async () => {
    const stale = source()
    await expect(loadTeamPage(stale, 'team_a', () => false)).resolves.toBeNull()
    expect(stale.showTeam).not.toHaveBeenCalled()
    expect(stale.readTeamLog).not.toHaveBeenCalled()
  })
})
