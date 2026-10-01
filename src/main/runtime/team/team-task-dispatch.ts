import { z } from 'zod'
import type {
  TeamDispatchWaitReason,
  TeamWorkWaitReason
} from '../../../shared/team-task-assignment'
import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { TaskRow } from '../orchestration/types'
import type { RpcContext } from '../rpc/core'
import { orchestrationCallerIdentity } from '../rpc/methods/orchestration/runs/run-scope'
import { startWorkerForRun } from '../rpc/methods/orchestration/worker/worker-start-for-run'
import { bindTeamManagerRun, resolveLiveTeamMemberHandle } from './team-member-lifecycle'

export type TeamTaskDispatchResult =
  | { outcome: 'started'; dispatchId: string; receipt: unknown }
  | { outcome: 'failed'; dispatchId: string | null; error: string; receipt: unknown }
  | { outcome: 'waiting'; waiting: TeamWorkWaitReason }

const WorkerStartReceiptSchema = z.object({
  dispatchId: z.string(),
  state: z.string(),
  lastError: z.string().optional()
})

type TeamDispatchRuntime = RpcContext['runtime']

/** The member's running terminal, or why it cannot take work. Unverifiable is not stopped. */
function memberAvailability(
  runtime: TeamDispatchRuntime,
  db: OrchestrationDb,
  member: TeamMemberRow
): { handle: string } | { waiting: TeamDispatchWaitReason } {
  if (member.paused_at) {
    return { waiting: 'member_paused' }
  }
  const handle = resolveLiveTeamMemberHandle(runtime, member)
  if (!handle || !member.worktree_id) {
    return {
      waiting: member.desired_state === 'running' ? 'member_unverifiable' : 'member_not_running'
    }
  }
  if (db.getActiveDispatchForIdentity(handle, member.pane_key ?? undefined)) {
    return { waiting: 'member_busy' }
  }
  return { handle }
}

function managerTerminal(runtime: TeamDispatchRuntime, db: OrchestrationDb, team: TeamRow) {
  const manager = db.getTeamManager(team.id)
  const handle = manager ? resolveLiveTeamMemberHandle(runtime, manager) : null
  const paneKey = handle ? runtime.getTerminalPaneKey(handle) : null
  return handle && paneKey ? { handle, paneKey } : null
}

/** The manager as the team Run's coordinator, rebinding it when a restart dropped the binding. */
function managerCoordinator(runtime: TeamDispatchRuntime, db: OrchestrationDb, team: TeamRow) {
  const terminal = managerTerminal(runtime, db, team)
  if (!terminal) {
    return null
  }
  const { handle, paneKey } = terminal
  const coordinator = orchestrationCallerIdentity(runtime, { handle, paneKey, session: undefined })
  if (db.getCurrentRunForCoordinator(coordinator)?.id !== team.run_id) {
    bindTeamManagerRun(runtime, db, team, handle, paneKey)
  }
  const run = db.getCurrentRunForCoordinator(coordinator)
  return run?.id === team.run_id ? { handle, coordinator, run } : null
}

/** Refuses a member that can never be given a task: one not on the team, or the manager. */
export function assertTeamMemberAssignable(team: TeamRow, member: TeamMemberRow): void {
  if (member.team_id !== team.id || member.archived_at) {
    throw new OrchestrationError('invalid_argument', `${member.slug} is not on team ${team.name}.`)
  }
  if (member.is_manager === 1) {
    throw new OrchestrationError(
      'invalid_argument',
      'The manager coordinates the team; assign the task to another member.'
    )
  }
}

/**
 * Refuses a pairing that can never start: a goal, a member not on the team, the manager, or a
 * task already running or finished. Callers check this before recording the assignment, so a
 * refused one leaves the task's assignee as it was.
 */
export function assertTeamTaskAssignable(
  db: OrchestrationDb,
  team: TeamRow,
  taskId: string,
  member: TeamMemberRow
): TaskRow {
  const meta = db.requireTeamTaskMeta(team.id, taskId)
  if (meta.kind === 'goal') {
    throw new OrchestrationError(
      'invalid_argument',
      'A goal is split into tasks by the manager; assign its tasks instead.'
    )
  }
  assertTeamMemberAssignable(team, member)
  const task = db.getTask(taskId)
  if (!task) {
    throw new OrchestrationError('task_not_found', `Task ${taskId} was not found.`)
  }
  if (task.status === 'dispatched' || task.status === 'completed') {
    throw new OrchestrationError(
      'team_conflict',
      `Task ${team.task_prefix}-${meta.number} is already ${task.status}.`
    )
  }
  return task
}

/** Why `task` cannot start on `member` yet, read without changing anything; null when it can. */
export function teamTaskDispatchWait(args: {
  runtime: TeamDispatchRuntime
  db: OrchestrationDb
  team: TeamRow
  task: Pick<TaskRow, 'status'>
  member: TeamMemberRow
}): TeamDispatchWaitReason | null {
  const { runtime, db, team, task, member } = args
  if (team.status !== 'active' || team.closing_at) {
    return 'team_inactive'
  }
  if (task.status === 'pending') {
    return 'deps'
  }
  if (task.status === 'blocked') {
    return 'task_blocked'
  }
  const availability = memberAvailability(runtime, db, member)
  if ('waiting' in availability) {
    return availability.waiting
  }
  return managerTerminal(runtime, db, team) ? null : 'manager_not_running'
}

/**
 * Starts `taskId` on `member`'s own terminal and worktree, as the manager's dispatch. Returns
 * `waiting` rather than throwing for anything that clears by itself, so callers can retry.
 * Only the team scheduler calls this: it holds the member's turn and its one start in flight.
 */
export async function startTeamTaskDispatch(args: {
  runtime: TeamDispatchRuntime
  db: OrchestrationDb
  team: TeamRow
  taskId: string
  member: TeamMemberRow
}): Promise<TeamTaskDispatchResult> {
  const { runtime, db, team, member } = args
  const task = assertTeamTaskAssignable(db, team, args.taskId, member)
  const wait = teamTaskDispatchWait({ runtime, db, team, task, member })
  if (wait) {
    return { outcome: 'waiting', waiting: wait }
  }
  const terminal = resolveLiveTeamMemberHandle(runtime, member)
  const manager = managerCoordinator(runtime, db, team)
  if (!terminal || !manager) {
    return { outcome: 'waiting', waiting: terminal ? 'manager_not_running' : 'member_unverifiable' }
  }
  // A failed task restarts as a retry of its last Dispatch, the only way a failed Task starts again.
  const retryOf = task.status === 'failed' ? db.getDispatchContext(task.id)?.id : undefined
  const receipt = await startWorkerForRun({
    params: {
      task: task.id,
      from: manager.handle,
      terminal,
      worktree: `id:${member.worktree_id}`,
      ...(retryOf ? { retryOf } : {})
    },
    runtime,
    db,
    run: manager.run,
    coordinator: manager.coordinator,
    existingTask: task
  })
  const parsed = WorkerStartReceiptSchema.safeParse(receipt)
  if (!parsed.success) {
    return {
      outcome: 'failed',
      dispatchId: null,
      error: 'Unrecognized worker-start receipt.',
      receipt
    }
  }
  return parsed.data.state === 'failed'
    ? {
        outcome: 'failed',
        dispatchId: parsed.data.dispatchId,
        error: parsed.data.lastError ?? 'The worker did not start.',
        receipt
      }
    : { outcome: 'started', dispatchId: parsed.data.dispatchId, receipt }
}
