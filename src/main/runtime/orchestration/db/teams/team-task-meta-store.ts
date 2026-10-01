import { z } from 'zod'
import { OrchestrationError } from '../../orchestration-error'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRow, queryTeamRows } from './team-row-query'

export const TEAM_TASK_KINDS = ['task', 'goal'] as const
export type TeamTaskKind = (typeof TEAM_TASK_KINDS)[number]

const TeamTaskMetaSchema = z.object({
  task_id: z.string(),
  team_id: z.string(),
  number: z.number(),
  kind: z.enum(TEAM_TASK_KINDS),
  assignee_member_id: z.string().nullable(),
  assigned_at: z.string().nullable(),
  review_requested_at: z.string().nullable(),
  start_failures: z.number(),
  retry_at: z.string().nullable(),
  escalated_at: z.string().nullable(),
  counted_dispatch_id: z.string().nullable()
})
/** What the team adds to an orchestration task: its ref number, kind, assignee, and start retries. */
export type TeamTaskMeta = z.infer<typeof TeamTaskMetaSchema>

export function getTeamTaskMeta(this: OrchestrationDb, taskId: string): TeamTaskMeta | undefined {
  return queryTeamRow(
    this.db,
    TeamTaskMetaSchema,
    'SELECT * FROM team_task_refs WHERE task_id = ?',
    taskId
  )
}

export function listTeamTaskMeta(this: OrchestrationDb, teamId: string): TeamTaskMeta[] {
  return queryTeamRows(
    this.db,
    TeamTaskMetaSchema,
    'SELECT * FROM team_task_refs WHERE team_id = ? ORDER BY number',
    teamId
  )
}

/** The team's task, numbered if it was not yet; throws when the task is not in the team's Run. */
export function requireTeamTaskMeta(
  this: OrchestrationDb,
  teamId: string,
  taskId: string
): TeamTaskMeta {
  const team = this.requireTeam(teamId)
  const task = this.getTask(taskId)
  if (!task || task.run_id !== team.run_id) {
    throw new OrchestrationError('task_not_found', `Task ${taskId} is not on team ${team.name}.`)
  }
  this.assignTeamTaskRefs(teamId)
  const meta = this.getTeamTaskMeta(taskId)
  if (!meta) {
    throw new OrchestrationError('task_not_found', `Task ${taskId} has no team ref.`)
  }
  return meta
}

/**
 * Sets or clears who works the task. Clearing keeps any dispatch already running. Either way the
 * start retries begin again, and the task's history so far is counted as already seen: assigning
 * is how a manager says "try this now".
 */
export function assignTeamTask(
  this: OrchestrationDb,
  teamId: string,
  taskId: string,
  memberId: string | null
): TeamTaskMeta {
  const meta = this.requireTeamTaskMeta(teamId, taskId)
  if (meta.kind === 'goal' && memberId !== null) {
    throw new OrchestrationError(
      'invalid_argument',
      'A goal is split into tasks by the manager; assign its tasks instead.'
    )
  }
  if (memberId !== null) {
    const member = this.requireTeamMember(memberId)
    if (member.team_id !== teamId) {
      throw new OrchestrationError('invalid_argument', `${member.slug} is not on this team.`)
    }
  }
  this.db
    .prepare(
      `UPDATE team_task_refs
       SET assignee_member_id = ?,
           assigned_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END,
           start_failures = 0, retry_at = NULL, escalated_at = NULL,
           counted_dispatch_id = (
             SELECT id FROM dispatch_contexts WHERE task_id = ? ORDER BY rowid DESC LIMIT 1)
       WHERE task_id = ?`
    )
    .run(memberId, memberId, taskId, taskId)
  return this.requireTeamTaskMeta(teamId, taskId)
}

export function markTeamTaskKind(
  this: OrchestrationDb,
  teamId: string,
  taskId: string,
  kind: TeamTaskKind
): TeamTaskMeta {
  this.requireTeamTaskMeta(teamId, taskId)
  this.db.prepare('UPDATE team_task_refs SET kind = ? WHERE task_id = ?').run(kind, taskId)
  return this.requireTeamTaskMeta(teamId, taskId)
}

/** Records (or clears, with null) that the manager was asked to review a finished goal. */
export function setTeamGoalReviewRequested(
  this: OrchestrationDb,
  taskId: string,
  requested: boolean
): void {
  this.db
    .prepare(
      `UPDATE team_task_refs
       SET review_requested_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
       WHERE task_id = ?`
    )
    .run(requested ? 1 : 0, taskId)
}

/**
 * Counts one failed start. `retryAt` null with `escalated` means Orca stops trying; `dispatchId`
 * is the failed Dispatch, left as it was when the start failed before one existed.
 */
export function recordTeamTaskStartFailure(
  this: OrchestrationDb,
  taskId: string,
  failure: { retryAt: string | null; escalated: boolean; dispatchId: string | null }
): void {
  this.db
    .prepare(
      `UPDATE team_task_refs
       SET start_failures = start_failures + 1, retry_at = ?,
           escalated_at = CASE WHEN ? THEN datetime('now') ELSE escalated_at END,
           counted_dispatch_id = COALESCE(?, counted_dispatch_id)
       WHERE task_id = ?`
    )
    .run(failure.retryAt, failure.escalated ? 1 : 0, failure.dispatchId, taskId)
}

export type TeamTaskMetaStoreMethods = {
  getTeamTaskMeta: typeof getTeamTaskMeta
  listTeamTaskMeta: typeof listTeamTaskMeta
  requireTeamTaskMeta: typeof requireTeamTaskMeta
  assignTeamTask: typeof assignTeamTask
  markTeamTaskKind: typeof markTeamTaskKind
  setTeamGoalReviewRequested: typeof setTeamGoalReviewRequested
  recordTeamTaskStartFailure: typeof recordTeamTaskStartFailure
}

export function attachTeamTaskMetaStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    getTeamTaskMeta,
    listTeamTaskMeta,
    requireTeamTaskMeta,
    assignTeamTask,
    markTeamTaskKind,
    setTeamGoalReviewRequested,
    recordTeamTaskStartFailure
  })
}
