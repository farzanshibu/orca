import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import {
  CLOSING_TIME_MESSAGE,
  TeamClosingTime,
  beginTeamClosingTime,
  endTeamClosingTime,
  listTeamClosingWaits
} from './team-closing-time'
import type { TeamMemberTurnState } from './team-member-turn-state'

describe('TeamClosingTime', () => {
  let db: OrchestrationDb
  let team: TeamRow
  const live = new Set<string>()
  const states = new Map<string, TeamMemberTurnState>()
  const stopMember = vi.fn(async (member: TeamMemberRow) => {
    live.delete(member.terminal_handle ?? '')
    db.setTeamMemberDesiredState(member.id, 'stopped')
  })
  const probe = {
    resolveLiveHandle: (member: TeamMemberRow) =>
      live.has(member.terminal_handle ?? '') ? member.terminal_handle : null,
    getTurnState: async (handle: string) => states.get(handle) ?? 'unknown'
  }

  function addRunningMember(slug: string): TeamMemberRow {
    const member = db.addTeamMember(team.id, { slug, roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(member.id, {
      worktreeId: 'wt',
      terminalHandle: `h_${slug}`,
      paneKey: null
    })
    live.add(`h_${slug}`)
    states.set(`h_${slug}`, 'idle')
    return db.setTeamMemberDesiredState(member.id, 'running')
  }

  function closingLoop(): TeamClosingTime {
    return new TeamClosingTime({ getDb: () => db, ...probe, stopMember })
  }

  async function tickTimes(loop: TeamClosingTime, times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      await loop.tick()
    }
  }

  const begin = () =>
    beginTeamClosingTime(db, db.requireTeam(team.id), (m) => live.has(m.terminal_handle ?? ''))
  const waits = () => listTeamClosingWaits(probe, db, db.requireTeam(team.id))

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    live.clear()
    states.clear()
    stopMember.mockClear()
  })

  afterEach(() => {
    db.close()
  })

  it('puts the wrap-up note ahead of what is already queued, once', () => {
    const jim = addRunningMember('jim')
    db.enqueueTeamMemberMessage(jim.id, 'earlier work')
    expect(begin()).toBe(1)
    expect(begin()).toBe(1)
    expect(db.listPendingTeamQueue(jim.id).map((item) => item.text)).toEqual([
      CLOSING_TIME_MESSAGE,
      'earlier work'
    ])
  })

  it('stops a paused member once it is idle, without a note it could never be sent', async () => {
    const jim = addRunningMember('jim')
    db.setTeamMemberPaused(jim.id, true, 'tool_loop')
    db.enqueueTeamMemberMessage(jim.id, 'held while paused')
    states.set('h_jim', 'working')
    expect(begin()).toBe(0)
    expect(db.listPendingTeamQueue(jim.id).map((item) => item.source)).toEqual(['operator'])

    const loop = closingLoop()
    await tickTimes(loop, 3)
    expect(await waits()).toEqual([{ member_id: jim.id, reason: 'working' }])
    expect(stopMember).not.toHaveBeenCalled()

    states.set('h_jim', 'idle')
    await tickTimes(loop, 2)
    expect(await waits()).toEqual([{ member_id: jim.id, reason: 'stopping' }])
    expect(stopMember).not.toHaveBeenCalled()
    await loop.tick()
    expect(stopMember).toHaveBeenCalledTimes(1)
    expect(db.requireTeam(team.id)).toMatchObject({ status: 'paused', closing_at: null })
    // The operator's own message survives for the next start.
    expect(db.listPendingTeamQueue(jim.id).map((item) => item.text)).toEqual(['held while paused'])
  })

  it('stops a member paused after its note was queued, and drops the untyped note', async () => {
    const jim = addRunningMember('jim')
    begin()
    db.setTeamMemberPaused(jim.id, true)
    await tickTimes(closingLoop(), 3)
    expect(stopMember).toHaveBeenCalledTimes(1)
    expect(db.requireTeam(team.id).closing_at).toBeNull()
    expect(db.listPendingTeamQueue(jim.id)).toHaveLength(0)
  })

  it('winds down a paused team, whose queue nobody is delivering', async () => {
    const jim = addRunningMember('jim')
    db.updateTeam(team.id, { status: 'paused' })
    expect(begin()).toBe(0)
    expect(db.listPendingTeamQueue(jim.id)).toHaveLength(0)
    await tickTimes(closingLoop(), 3)
    expect(stopMember).toHaveBeenCalledTimes(1)
    expect(db.requireTeam(team.id)).toMatchObject({ status: 'paused', closing_at: null })
  })

  it('never completes while a member is unverifiable', async () => {
    const jim = addRunningMember('jim')
    const pam = addRunningMember('pam')
    begin()
    db.settleTeamQueueItem(db.listPendingTeamQueue(jim.id)[0].id, { delivered: true })
    // Pam's terminal can no longer be found; that is not evidence her agent stopped.
    live.delete('h_pam')

    const loop = closingLoop()
    await tickTimes(loop, 6)
    expect(stopMember).toHaveBeenCalledTimes(1)
    expect(stopMember.mock.calls[0][0].id).toBe(jim.id)
    expect(db.requireTeam(team.id)).toMatchObject({ status: 'active' })
    expect(db.requireTeam(team.id).closing_at).not.toBeNull()
    expect(await waits()).toEqual([{ member_id: pam.id, reason: 'unverifiable' }])

    // Only the operator stopping her (or her terminal coming back and going quiet) ends the wait.
    db.setTeamMemberDesiredState(pam.id, 'stopped')
    await loop.tick()
    expect(db.requireTeam(team.id)).toMatchObject({ status: 'paused', closing_at: null })
  })

  it('names why it is still waiting on each live member', async () => {
    const jim = addRunningMember('jim')
    const pam = addRunningMember('pam')
    const dwight = addRunningMember('dwight')
    begin()
    states.set('h_pam', 'needs_human')
    states.set('h_dwight', 'unknown')
    expect(await waits()).toEqual([
      { member_id: jim.id, reason: 'closing_note_queued' },
      { member_id: pam.id, reason: 'needs_human' },
      { member_id: dwight.id, reason: 'status_unknown' }
    ])
    await tickTimes(closingLoop(), 6)
    expect(stopMember).not.toHaveBeenCalled()
  })

  it('keeps waiting on a member whose stop failed', async () => {
    const jim = addRunningMember('jim')
    begin()
    db.settleTeamQueueItem(db.listPendingTeamQueue(jim.id)[0].id, { delivered: true })
    stopMember.mockRejectedValueOnce(new Error('close failed'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loop = closingLoop()
    await tickTimes(loop, 3)
    expect(db.requireTeam(team.id).closing_at).not.toBeNull()
    await tickTimes(loop, 3)
    expect(stopMember).toHaveBeenCalledTimes(2)
    expect(db.requireTeam(team.id)).toMatchObject({ status: 'paused', closing_at: null })
    warn.mockRestore()
  })

  it('drops untyped wrap-up notes when the wind-down is cancelled', () => {
    const jim = addRunningMember('jim')
    db.enqueueTeamMemberMessage(jim.id, 'keep me')
    begin()
    endTeamClosingTime(db, db.requireTeam(team.id))
    expect(db.requireTeam(team.id).closing_at).toBeNull()
    expect(db.listPendingTeamQueue(jim.id).map((item) => item.text)).toEqual(['keep me'])
  })
})
