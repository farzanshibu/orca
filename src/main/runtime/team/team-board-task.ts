import type { TeamTaskCreateResult } from '../../../shared/team-goal'
import type { OrchestrationDb } from '../orchestration/db'
import type { TeamTaskMeta } from '../orchestration/db/teams/team-task-meta-store'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { assignTeamTaskToMember } from './team-assign-task'
import type { TeamCaller } from './team-caller-authority'
import { assertTeamMemberAssignable } from './team-task-dispatch'

/** The team's goal behind a ref or id, open or closed; throws for anything that is not a goal. */
export function requireTeamGoal(db: OrchestrationDb, team: TeamRow, selector: string) {
  const taskId = db.resolveTeamTaskRef(team.id, selector)
  const meta = db.requireTeamTaskMeta(team.id, taskId)
  const task = db.getTask(taskId)
  if (meta.kind !== 'goal' || !task) {
    throw new OrchestrationError('invalid_argument', `${selector} is not a goal of ${team.name}.`)
  }
  return { meta, task, ref: `${team.task_prefix}-${meta.number}` }
}

function requireOpenTeamGoal(db: OrchestrationDb, team: TeamRow, selector: string): TeamTaskMeta {
  const goal = requireTeamGoal(db, team, selector)
  if (goal.task.status === 'completed' || goal.task.status === 'failed') {
    throw new OrchestrationError(
      'team_conflict',
      `Goal ${goal.ref} is closed; file the task under an open goal or on its own.`
    )
  }
  return goal.meta
}

/** A task this one may wait on: on the team's board, and not a goal, which never completes by work. */
function resolveTeamTaskDependency(db: OrchestrationDb, team: TeamRow, selector: string): string {
  const taskId = db.resolveTeamTaskRef(team.id, selector)
  if (db.requireTeamTaskMeta(team.id, taskId).kind === 'goal') {
    throw new OrchestrationError(
      'invalid_argument',
      `${selector} is a goal; a task depends on other tasks, not on a goal.`
    )
  }
  return taskId
}

/**
 * Files a task on the team board, optionally under a goal, after other tasks, and with an owner.
 * Everything is checked before the task is created, so a refused request leaves nothing behind.
 */
export async function fileTeamTask(args: {
  runtime: RpcContext['runtime']
  db: OrchestrationDb
  team: TeamRow
  caller: TeamCaller
  title: string
  spec?: string
  goal?: string
  assignee?: string
  deps?: readonly string[]
}): Promise<TeamTaskCreateResult> {
  const { runtime, db, team, caller } = args
  const goalId = args.goal ? requireOpenTeamGoal(db, team, args.goal).task_id : undefined
  const deps = (args.deps ?? []).map((dep) => resolveTeamTaskDependency(db, team, dep))
  const member = args.assignee ? db.resolveTeamMemberSelector(team.id, args.assignee) : null
  if (member) {
    assertTeamMemberAssignable(team, member)
  }
  const task = db.createTask({
    runId: team.run_id,
    taskTitle: args.title,
    spec: args.spec ?? args.title,
    parentId: goalId,
    deps: [...new Set(deps)],
    // Lets the feed name the manager, not the operator, as who filed it.
    ...(caller.kind === 'member'
      ? {
          createdByTerminalHandle: caller.member.terminal_handle ?? undefined,
          createdByPaneKey: caller.member.pane_key ?? undefined
        }
      : {})
  })
  const ref = db.assignTeamTaskRefs(team.id).get(task.id) ?? null
  if (goalId) {
    // A goal with a new task is not finished, whatever it was a moment ago.
    db.setTeamGoalReviewRequested(goalId, false)
  }
  const assignment = member
    ? await assignTeamTaskToMember({ runtime, db, team, caller, taskId: task.id, member })
    : undefined
  return {
    enriched: false,
    taskId: task.id,
    ref,
    ...(goalId ? { goalId } : {}),
    ...(assignment ? { assignment } : {})
  }
}
