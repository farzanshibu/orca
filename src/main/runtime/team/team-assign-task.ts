import type { TeamTaskAssignResult } from '../../../shared/team-task-assignment'
import type { OrchestrationDb } from '../orchestration/db'
import { teamActivitySubject } from '../orchestration/db/teams/team-activity-store'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { teamCallerParticipant, type TeamCaller } from './team-caller-authority'
import { assertTeamTaskAssignable } from './team-task-dispatch'
import { teamWorkSchedulerFor } from './team-work-scheduler-for-runtime'

/**
 * Makes `member` the task's assignee (or nobody, with null), says so in the feed, and has the
 * scheduler try the task now. A refused pairing throws before anything is written.
 */
export async function assignTeamTaskToMember(args: {
  runtime: RpcContext['runtime']
  db: OrchestrationDb
  team: TeamRow
  caller: TeamCaller
  taskId: string
  member: TeamMemberRow | null
}): Promise<TeamTaskAssignResult> {
  const { runtime, db, team, caller, taskId, member } = args
  if (member) {
    assertTeamTaskAssignable(db, team, taskId, member)
  }
  const meta = db.assignTeamTask(team.id, taskId, member?.id ?? null)
  const ref = `${team.task_prefix}-${meta.number}`
  const task = db.getTask(taskId)
  db.recordTeamActivity({
    teamId: team.id,
    kind: 'task_assigned',
    status: member ? 'assigned' : 'unassigned',
    taskId,
    from: teamCallerParticipant(caller),
    to: member ? { party: 'member', memberId: member.id } : { party: 'team' },
    subject: task?.task_title ?? teamActivitySubject(task?.spec ?? ref)
  })
  if (!member) {
    return { taskId, ref, member: null, assigned: false, started: false }
  }
  // Assigning starts the task now when it can; otherwise the scheduler does once the reason clears.
  const result = await teamWorkSchedulerFor(runtime).considerNow(team, taskId, member)
  return {
    taskId,
    ref,
    member: member.slug,
    assigned: true,
    started: result.outcome === 'started',
    ...(result.outcome === 'waiting' ? { waiting: result.waiting } : {}),
    ...(result.outcome === 'failed' ? { error: result.error } : {}),
    ...(result.outcome === 'waiting' ? {} : { dispatchId: result.dispatchId })
  }
}
