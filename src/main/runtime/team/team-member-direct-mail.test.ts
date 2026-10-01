import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import { carryTeamMemberDirectMail, TEAM_MAIL_QUEUE_SOURCE } from './team-member-direct-mail'

describe('a restarted member keeps its unread mail', () => {
  let db: OrchestrationDb
  let team: TeamRow
  const notifyMessageArrived = vi.fn()
  const runtime = {
    getTerminalOrchestrationCliCommand: () => 'orca' as const,
    notifyMessageArrived
  }

  function member(slug: string, handle: string, manager = false): TeamMemberRow {
    const row = db.addTeamMember(team.id, {
      slug,
      roleSlug: 'engineer',
      agent: 'claude',
      isManager: manager
    })
    return db.bindTeamMemberTerminal(row.id, {
      worktreeId: `wt_${slug}`,
      terminalHandle: handle,
      paneKey: null
    })
  }

  function mail(to: string, subject: string) {
    return db.insertMessage({ from: 'term_pam', to, subject, runId: team.run_id })
  }

  /** What stopping a member does to its row: the handle is forgotten. */
  function stopped(row: TeamMemberRow): TeamMemberRow {
    return db.bindTeamMemberTerminal(row.id, {
      worktreeId: row.worktree_id,
      terminalHandle: null,
      paneKey: null
    })
  }

  function subjects(handle: string): string[] {
    return db.getUnreadMessages(handle).map((message) => message.subject)
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    notifyMessageArrived.mockReset()
  })

  afterEach(() => {
    db.close()
  })

  it('moves mail to the new handle after a stop forgot the old one', () => {
    const jim = member('jim', 'term_old')
    member('pam', 'term_pam')
    mail('term_old', 'one')
    mail('term_old', 'two')

    const moved = carryTeamMemberDirectMail({
      runtime,
      db,
      team,
      member: stopped(jim),
      handle: 'term_new'
    })

    expect(moved).toBe(2)
    expect(subjects('term_new')).toEqual(['one', 'two'])
    expect(subjects('term_old')).toEqual([])
    expect(notifyMessageArrived).toHaveBeenCalledWith('term_new', 'status')
    const queue = db.listPendingTeamQueue(jim.id)
    expect(queue).toMatchObject([{ source: TEAM_MAIL_QUEUE_SOURCE }])
    expect(queue[0]?.text).toContain('2 messages arrived while you were away')
  })

  it('moves mail by the previous handle when the feed no longer names the member', () => {
    const jim = member('jim', 'term_old')
    mail('term_old', 'from before the prune')
    db.pruneTeamActivity({ maxAgeDays: 30, maxRowsPerTeam: 0 })

    expect(carryTeamMemberDirectMail({ runtime, db, team, member: jim, handle: 'term_new' })).toBe(
      1
    )
    expect(subjects('term_new')).toEqual(['from before the prune'])
  })

  it('moves nothing that is read, addressed to someone else, or in the Run mailbox', () => {
    const jim = member('jim', 'term_old')
    member('pam', 'term_pam')
    const read = mail('term_old', 'already read')
    db.markAsRead([read.id])
    mail('term_pam', 'for pam')
    mail(`run:${team.run_id}`, 'for the manager')

    expect(
      carryTeamMemberDirectMail({ runtime, db, team, member: stopped(jim), handle: 'term_new' })
    ).toBe(0)
    expect(subjects('term_pam')).toEqual(['for pam'])
    expect(subjects(`run:${team.run_id}`)).toEqual(['for the manager'])
    expect(db.getMessageById(read.id)?.to_handle).toBe('term_old')
    expect(notifyMessageArrived).not.toHaveBeenCalled()
    expect(db.listPendingTeamQueue(jim.id)).toHaveLength(0)
  })

  it('leaves the manager to its Run mailbox instead of typing a wake-up', () => {
    const michael = member('michael', 'term_old_mgr', true)
    mail('term_old_mgr', 'sent to the handle')

    carryTeamMemberDirectMail({ runtime, db, team, member: michael, handle: 'term_new_mgr' })

    expect(subjects('term_new_mgr')).toEqual(['sent to the handle'])
    expect(notifyMessageArrived).toHaveBeenCalledWith('term_new_mgr', 'status')
    expect(db.listPendingTeamQueue(michael.id)).toHaveLength(0)
  })
})
