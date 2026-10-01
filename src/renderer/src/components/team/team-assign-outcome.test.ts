import { describe, expect, it } from 'vitest'
import type { TeamTaskAssignResult } from '../../../../shared/team-task-assignment'
import {
  assignableTeamMembers,
  canAssignTeamTask,
  isTeamAssignRecordCurrent,
  teamAssignNote,
  teamTaskStandingWait
} from './team-assign-outcome'
import { makeTeamMember, makeTeamTask } from './team-snapshot-test-fixtures'

function result(overrides: Partial<TeamTaskAssignResult> = {}): TeamTaskAssignResult {
  return {
    taskId: 'task_1',
    ref: 'bmt-1',
    member: 'ada',
    assigned: true,
    started: false,
    ...overrides
  }
}

describe('teamAssignNote', () => {
  it('says a task started', () => {
    expect(teamAssignNote(result({ started: true, dispatchId: 'dispatch_1' }))).toEqual({
      tone: 'neutral',
      text: 'Started'
    })
  })

  it('gives the wait reason in words, for the scheduler’s reasons too', () => {
    expect(teamAssignNote(result({ waiting: 'member_busy' }))?.text).toBe('Finishing another task')
    expect(teamAssignNote(result({ waiting: 'retry_backoff' }))?.text).toBe(
      'Start failed; Orca retries shortly'
    )
    expect(teamAssignNote(result({ waiting: 'member_on_leave' }))?.text).toBe('Member on leave')
  })

  it('reports a failed start as an error with the host’s reason', () => {
    expect(teamAssignNote(result({ error: 'The worker did not start.' }))).toEqual({
      tone: 'error',
      text: 'Could not start: The worker did not start.'
    })
  })

  it('claims no start for an assignment the host gave no reason for', () => {
    expect(teamAssignNote(result())?.text).toBe('Assigned, not started yet')
  })

  it('has nothing to say about an unassignment', () => {
    expect(teamAssignNote(result({ assigned: false, member: null }))).toBeNull()
  })
})

describe('isTeamAssignRecordCurrent', () => {
  const waiting = { memberId: 'member_ada', result: result({ waiting: 'member_busy' }) }
  const started = { memberId: 'member_ada', result: result({ started: true }) }
  const task = (status: string, assignee: string | null = 'member_ada') =>
    makeTeamTask({ status, assignee_member_id: assignee })

  it('keeps a wait reason until the task starts, finishes or changes hands', () => {
    expect(isTeamAssignRecordCurrent(task('ready'), waiting)).toBe(true)
    expect(isTeamAssignRecordCurrent(task('pending'), waiting)).toBe(true)
    expect(isTeamAssignRecordCurrent(task('dispatched'), waiting)).toBe(false)
    expect(isTeamAssignRecordCurrent(task('completed'), waiting)).toBe(false)
    expect(isTeamAssignRecordCurrent(task('ready', 'member_bo'), waiting)).toBe(false)
    expect(isTeamAssignRecordCurrent(task('ready', null), waiting)).toBe(false)
  })

  it('keeps "started" only while the task is running', () => {
    expect(isTeamAssignRecordCurrent(task('dispatched'), started)).toBe(true)
    expect(isTeamAssignRecordCurrent(task('failed'), started)).toBe(false)
    expect(isTeamAssignRecordCurrent(task('completed'), started)).toBe(false)
  })
})

describe('assigning from the board', () => {
  it('offers no assignment for a goal, a running task or a finished one', () => {
    expect(canAssignTeamTask({ status: 'ready', kind: 'task' })).toBe(true)
    expect(canAssignTeamTask({ status: 'failed' })).toBe(true)
    expect(canAssignTeamTask({ status: 'pending', kind: 'task' })).toBe(true)
    expect(canAssignTeamTask({ status: 'ready', kind: 'goal' })).toBe(false)
    expect(canAssignTeamTask({ status: 'dispatched', kind: 'task' })).toBe(false)
    expect(canAssignTeamTask({ status: 'completed', kind: 'task' })).toBe(false)
  })

  it('leaves the manager out of who a task can go to', () => {
    const ada = makeTeamMember({ id: 'member_ada' })
    const lead = makeTeamMember({ id: 'member_lead', is_manager: 1 })
    expect(assignableTeamMembers([lead, ada])).toEqual([ada])
  })
})

describe('teamTaskStandingWait', () => {
  const ada = { id: 'member_ada', waiting_reason: 'member_busy' }
  const mine = makeTeamTask({ id: 'task_mine', assignee_member_id: 'member_ada' })

  it('shows the member’s wait reason on its one unstarted task', () => {
    const running = makeTeamTask({
      id: 'task_running',
      status: 'dispatched',
      assignee_member_id: 'member_ada'
    })
    expect(teamTaskStandingWait(mine, ada, [mine, running])).toBe('member_busy')
  })

  it('stays silent when the reason could be about another of the member’s tasks', () => {
    const other = makeTeamTask({
      id: 'task_other',
      status: 'pending',
      assignee_member_id: 'member_ada'
    })
    expect(teamTaskStandingWait(mine, ada, [mine, other])).toBeNull()
  })

  it('stays silent with no reason, no owner, or an owner by dispatch handle only', () => {
    expect(
      teamTaskStandingWait(mine, { id: 'member_ada', waiting_reason: null }, [mine])
    ).toBeNull()
    expect(teamTaskStandingWait(mine, { id: 'member_ada' }, [mine])).toBeNull()
    expect(teamTaskStandingWait(mine, undefined, [mine])).toBeNull()
    const byHandle = makeTeamTask({ id: 'task_handle', assignee_handle: 'term_1' })
    expect(teamTaskStandingWait(byHandle, ada, [byHandle])).toBeNull()
  })
})
