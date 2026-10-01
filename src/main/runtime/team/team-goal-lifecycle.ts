import type { TeamGoalCloseResult, TeamGoalCreateResult } from '../../../shared/team-goal'
import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { requireTeamGoal } from './team-board-task'
import { teamCallerParticipant, type TeamCaller } from './team-caller-authority'
import {
  TEAM_GOAL_QUEUE_SOURCE,
  buildTeamGoalPrompt,
  dropQueuedTeamGoalPrompts
} from './team-goal-prompt'
import { resolveLiveTeamMemberHandle } from './team-member-lifecycle'
import { teamMemberLiveness } from './team-member-liveness'
import { readTeamWorkspaceFacts } from './team-workspace-facts'

/**
 * Files a goal: a task that is never worked itself, only split into tasks by the manager. The
 * operator's goal queues the planning prompt for the manager; a manager filing its own already
 * knows what it wants and is told nothing.
 */
export async function createTeamGoal(args: {
  runtime: RpcContext['runtime']
  db: OrchestrationDb
  team: TeamRow
  caller: TeamCaller
  title: string
  spec?: string
}): Promise<TeamGoalCreateResult> {
  const { runtime, db, team, caller } = args
  if (team.status !== 'active' || team.closing_at) {
    throw new OrchestrationError(
      'team_paused',
      `Team ${team.name} is ${team.closing_at ? 'closing' : team.status}; resume it before giving it a goal.`
    )
  }
  const manager = db.getTeamManager(team.id)
  if (!manager) {
    throw new OrchestrationError(
      'team_member_not_found',
      `Team ${team.name} has no manager to plan a goal; add one first.`
    )
  }
  // Read before anything is written: a repository that cannot be read must not leave a goal behind.
  const workspace = caller.kind === 'operator' ? await readTeamWorkspaceFacts(runtime, team) : null
  const spec = args.spec ?? args.title
  const task = db.createTask({
    runId: team.run_id,
    taskTitle: args.title,
    spec,
    ...(caller.kind === 'member'
      ? {
          createdByTerminalHandle: caller.member.terminal_handle ?? undefined,
          createdByPaneKey: caller.member.pane_key ?? undefined
        }
      : {})
  })
  const meta = db.markTeamTaskKind(team.id, task.id, 'goal')
  const ref = `${team.task_prefix}-${meta.number}`
  if (workspace) {
    const openTasks = db.countTeamMemberOpenTasks(team.id)
    const roster = db
      .listTeamMembers(team.id)
      .filter((member) => member.is_manager !== 1)
      .map((member) => ({
        member,
        liveness: teamMemberLiveness(member, resolveLiveTeamMemberHandle(runtime, member)),
        openTasks: openTasks.get(member.id) ?? 0
      }))
    db.enqueueTeamMemberMessage(
      manager.id,
      buildTeamGoalPrompt({ team, goal: { ref, title: args.title, spec }, roster, workspace }),
      TEAM_GOAL_QUEUE_SOURCE
    )
  }
  return { goalId: task.id, ref, title: args.title, queued: workspace !== null }
}

/**
 * Closes a goal as done, or with `cancel` stops it. Either way no task of it starts afterwards:
 * whatever has not finished and is not running loses its owner.
 */
export function closeTeamGoal(args: {
  db: OrchestrationDb
  team: TeamRow
  caller: TeamCaller
  goal: string
  summary?: string
  cancel?: boolean
}): TeamGoalCloseResult {
  const { db, team, caller } = args
  const cancel = args.cancel === true
  const { task, ref } = requireTeamGoal(db, team, args.goal)
  if (task.status === 'completed' || task.status === 'failed') {
    throw new OrchestrationError('team_conflict', `Goal ${ref} is already closed.`)
  }
  const children = db.listTeamGoalChildren(task.id)
  const unfinished = children.filter(
    (child) => child.status !== 'completed' && child.status !== 'failed'
  )
  if (!cancel && unfinished.length > 0) {
    throw new OrchestrationError(
      'team_conflict',
      `Goal ${ref} still has ${unfinished.length} unfinished task(s). Wait for them, or pass --cancel to stop the goal.`
    )
  }
  let cancelledTasks = 0
  let runningTasks = 0
  for (const child of children) {
    if (child.status === 'completed') {
      continue
    }
    if (child.status !== 'failed') {
      try {
        db.updateTaskStatus(child.id, 'failed', `Cancelled with goal ${ref}.`)
        cancelledTasks += 1
      } catch {
        // A task with a worker on it cannot be failed from here; it finishes on its own.
        runningTasks += 1
        continue
      }
    }
    // A failed task with an owner is one the scheduler may still retry.
    db.assignTeamTask(team.id, child.id, null)
  }
  dropQueuedTeamGoalPrompts(db, team, ref, { planning: true })
  db.updateTaskStatus(
    task.id,
    cancel ? 'failed' : 'completed',
    args.summary ?? (cancel ? 'Cancelled.' : 'Completed.')
  )
  db.attributeTeamTaskSettlement(task.id, {
    from: teamCallerParticipant(caller),
    to: caller.kind === 'member' ? { party: 'operator' } : { party: 'team' },
    ...(cancel ? { status: 'cancelled' } : {})
  })
  return {
    goalId: task.id,
    ref,
    status: cancel ? 'cancelled' : 'completed',
    cancelledTasks,
    runningTasks
  }
}
