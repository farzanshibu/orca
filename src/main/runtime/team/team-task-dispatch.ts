import { z } from 'zod'
import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { orchestrationCallerIdentity } from '../rpc/methods/orchestration/runs/run-scope'
import { startWorkerForRun } from '../rpc/methods/orchestration/worker/worker-start-for-run'
import { bindTeamManagerRun, resolveLiveTeamMemberHandle } from './team-member-lifecycle'

/** Why an assigned task has not started yet; each clears on its own, so the scheduler retries. */
export const TEAM_DISPATCH_WAIT_REASONS = [
  'deps',
  'task_blocked',
  'member_busy',
  'member_paused',
  'member_not_running',
  'member_unverifiable',
  'manager_not_running',
  'team_inactive'
] as const
export type TeamDispatchWaitReason = (typeof TEAM_DISPATCH_WAIT_REASONS)[number]

export type TeamTaskDispatchResult =
  | { outcome: 'started'; dispatchId: string; receipt: unknown }
  | { outcome: 'failed'; dispatchId: string | null; error: string; receipt: unknown }
  | { outcome: 'waiting'; waiting: TeamDispatchWaitReason }

const WorkerStartReceiptSchema = z.object({
  dispatchId: z.string(),
  state: z.string(),
  lastError: z.string().optional()
})

type TeamDispatchRuntime = RpcContext['runtime']

// Members with a start in flight: the active-Dispatch check cannot see one until its row is written.
const startingMembers = new Set<string>()

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

/** The manager as the team Run's coordinator, rebinding it when a restart dropped the binding. */
function managerCoordinator(runtime: TeamDispatchRuntime, db: OrchestrationDb, team: TeamRow) {
  const manager = db.getTeamManager(team.id)
  const handle = manager ? resolveLiveTeamMemberHandle(runtime, manager) : null
  const paneKey = handle ? runtime.getTerminalPaneKey(handle) : null
  if (!handle || !paneKey) {
    return null
  }
  const coordinator = orchestrationCallerIdentity(runtime, { handle, paneKey, session: undefined })
  if (db.getCurrentRunForCoordinator(coordinator)?.id !== team.run_id) {
    bindTeamManagerRun(runtime, db, team, handle, paneKey)
  }
  const run = db.getCurrentRunForCoordinator(coordinator)
  return run?.id === team.run_id ? { handle, coordinator, run } : null
}

/**
 * Starts `taskId` on `member`'s own terminal and worktree, as the manager's dispatch. Returns
 * `waiting` rather than throwing for anything that clears by itself, so callers can retry.
 */
export async function startTeamTaskDispatch(args: {
  runtime: TeamDispatchRuntime
  db: OrchestrationDb
  team: TeamRow
  taskId: string
  member: TeamMemberRow
}): Promise<TeamTaskDispatchResult> {
  const { runtime, db, team, member } = args
  const meta = db.requireTeamTaskMeta(team.id, args.taskId)
  if (meta.kind === 'goal') {
    throw new OrchestrationError(
      'invalid_argument',
      'A goal is split into tasks by the manager; dispatch its tasks instead.'
    )
  }
  if (member.team_id !== team.id || member.archived_at) {
    throw new OrchestrationError('invalid_argument', `${member.slug} is not on team ${team.name}.`)
  }
  if (member.is_manager === 1) {
    throw new OrchestrationError(
      'invalid_argument',
      'The manager coordinates the team; assign the task to another member.'
    )
  }
  if (team.status !== 'active' || team.closing_at) {
    return { outcome: 'waiting', waiting: 'team_inactive' }
  }
  const task = db.getTask(args.taskId)
  if (!task) {
    throw new OrchestrationError('task_not_found', `Task ${args.taskId} was not found.`)
  }
  if (task.status === 'pending') {
    return { outcome: 'waiting', waiting: 'deps' }
  }
  if (task.status === 'blocked') {
    return { outcome: 'waiting', waiting: 'task_blocked' }
  }
  if (task.status !== 'ready' && task.status !== 'failed') {
    throw new OrchestrationError('team_conflict', `Task ${meta.number} is already ${task.status}.`)
  }
  const availability = memberAvailability(runtime, db, member)
  if ('waiting' in availability) {
    return { outcome: 'waiting', waiting: availability.waiting }
  }
  if (startingMembers.has(member.id)) {
    return { outcome: 'waiting', waiting: 'member_busy' }
  }
  const manager = managerCoordinator(runtime, db, team)
  if (!manager) {
    return { outcome: 'waiting', waiting: 'manager_not_running' }
  }
  // A failed task restarts as a retry of its last Dispatch, the only way a failed Task starts again.
  const retryOf = task.status === 'failed' ? db.getDispatchContext(task.id)?.id : undefined
  startingMembers.add(member.id)
  let receipt: unknown
  try {
    receipt = await startWorkerForRun({
      params: {
        task: task.id,
        from: manager.handle,
        terminal: availability.handle,
        worktree: `id:${member.worktree_id}`,
        ...(retryOf ? { retryOf } : {})
      },
      runtime,
      db,
      run: manager.run,
      coordinator: manager.coordinator,
      existingTask: task
    })
  } finally {
    startingMembers.delete(member.id)
  }
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
