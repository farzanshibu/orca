import { describe, expect, it } from 'vitest'
import { makeTeamMember, makeTeamTask } from './team-snapshot-test-fixtures'
import { teamMemberCurrentTask, teamTaskOwner } from './team-task-owner'

const ada = makeTeamMember({ id: 'member_ada', live_handle: 'term_ada' })
const bo = makeTeamMember({ id: 'member_bo', live_handle: 'term_bo' })
const members = [ada, bo]

describe('teamTaskOwner', () => {
  it('prefers the recorded assignee over the dispatch handle', () => {
    const task = makeTeamTask({ assignee_member_id: 'member_bo', assignee_handle: 'term_ada' })
    expect(teamTaskOwner(task, members)).toBe(bo)
  })

  it('names the assignee of a task that has not started', () => {
    const task = makeTeamTask({ assignee_member_id: 'member_ada', assignee_handle: null })
    expect(teamTaskOwner(task, members)).toBe(ada)
  })

  it('falls back to the dispatch handle when the host sends no assignee', () => {
    expect(teamTaskOwner(makeTeamTask({ assignee_handle: 'term_bo' }), members)).toBe(bo)
    expect(
      teamTaskOwner(makeTeamTask({ assignee_member_id: null, assignee_handle: 'term_bo' }), members)
    ).toBe(bo)
  })

  it('falls back to the handle when the assignee left the roster', () => {
    const task = makeTeamTask({ assignee_member_id: 'member_gone', assignee_handle: 'term_ada' })
    expect(teamTaskOwner(task, members)).toBe(ada)
  })

  it('has no owner for an unassigned task', () => {
    expect(teamTaskOwner(makeTeamTask(), members)).toBeUndefined()
    expect(teamTaskOwner(makeTeamTask({ assignee_handle: 'term_other' }), members)).toBeUndefined()
  })
})

describe('teamMemberCurrentTask', () => {
  const running = makeTeamTask({
    id: 'task_run',
    status: 'dispatched',
    assignee_handle: 'term_ada'
  })
  const done = makeTeamTask({ id: 'task_done', status: 'completed', assignee_handle: 'term_ada' })

  it('uses the task the host names, even after the handle was reminted', () => {
    const member = makeTeamMember({
      live_handle: 'term_new',
      current_task: { task_id: 'task_run', ref: 'bmt-1', dispatch_id: 'dispatch_1' }
    })
    expect(teamMemberCurrentTask(member, [done, running])).toBe(running)
  })

  it('trusts a host that says the member holds no task', () => {
    const member = makeTeamMember({ live_handle: 'term_ada', current_task: null })
    expect(teamMemberCurrentTask(member, [running])).toBeUndefined()
  })

  it('matches the dispatched task by handle for a host without current_task', () => {
    expect(teamMemberCurrentTask(ada, [done, running])).toBe(running)
    expect(teamMemberCurrentTask(bo, [done, running])).toBeUndefined()
    expect(teamMemberCurrentTask(makeTeamMember({ live_handle: null }), [running])).toBeUndefined()
  })
})
