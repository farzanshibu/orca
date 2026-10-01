import { z } from 'zod'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRow, queryTeamRows } from './team-row-query'

const latestDispatchSql = (column: string): string =>
  `(SELECT d.${column} FROM dispatch_contexts d WHERE d.task_id = t.id ORDER BY d.rowid DESC LIMIT 1)`

// A failed task is the scheduler's to restart only while nothing has run since it was counted.
const RESTARTABLE_FAILURE_SQL = `(t.status = 'failed' AND r.counted_dispatch_id IS NOT NULL
  AND r.counted_dispatch_id = ${latestDispatchSql('id')})`

const TeamAssignedTaskSchema = z.object({
  task_id: z.string(),
  team_id: z.string(),
  number: z.number(),
  assignee_member_id: z.string(),
  status: z.string(),
  retry_at: z.string().nullable(),
  escalated_at: z.string().nullable(),
  counted_dispatch_id: z.string().nullable(),
  last_dispatch_id: z.string().nullable(),
  last_dispatch_status: z.string().nullable(),
  last_dispatch_failure: z.string().nullable()
})
/** An assigned task that has not finished, with what the scheduler needs to decide on it. */
export type TeamAssignedTask = z.infer<typeof TeamAssignedTaskSchema>

const ASSIGNED_TASK_COLUMNS_SQL = `r.task_id, r.team_id, r.number, r.assignee_member_id, t.status,
  r.retry_at, r.escalated_at, r.counted_dispatch_id,
  ${latestDispatchSql('id')} AS last_dispatch_id,
  ${latestDispatchSql('status')} AS last_dispatch_status,
  ${latestDispatchSql('last_failure')} AS last_dispatch_failure`

/**
 * Every task the scheduler may start now, oldest assignment first, across all working teams.
 * Driven by tasks(run_id, status), so finished tasks and idle teams cost nothing.
 */
export function listStartableTeamTasks(this: OrchestrationDb): TeamAssignedTask[] {
  return queryTeamRows(
    this.db,
    TeamAssignedTaskSchema,
    `SELECT ${ASSIGNED_TASK_COLUMNS_SQL}
     FROM teams tm
     JOIN tasks t ON t.run_id = tm.run_id AND t.status IN ('ready', 'failed')
     JOIN team_task_refs r ON r.task_id = t.id
     WHERE tm.status = 'active' AND tm.closing_at IS NULL
       AND r.kind = 'task' AND r.assignee_member_id IS NOT NULL AND r.escalated_at IS NULL
       AND (t.status = 'ready' OR ${RESTARTABLE_FAILURE_SQL})
     ORDER BY r.assigned_at, r.number`
  )
}

/** One team's assigned tasks that have not started, oldest assignment first. */
export function listTeamAssignedBacklog(this: OrchestrationDb, teamId: string): TeamAssignedTask[] {
  return queryTeamRows(
    this.db,
    TeamAssignedTaskSchema,
    `SELECT ${ASSIGNED_TASK_COLUMNS_SQL}
     FROM team_task_refs r
     JOIN tasks t ON t.id = r.task_id
     WHERE r.team_id = ? AND r.kind = 'task' AND r.assignee_member_id IS NOT NULL
       AND (t.status IN ('pending', 'ready', 'blocked') OR ${RESTARTABLE_FAILURE_SQL})
     ORDER BY r.assigned_at, r.number`,
    teamId
  )
}

/** Members whose assigned task has a Dispatch under way, whichever terminal it runs in. */
export function listTeamMemberIdsWithActiveDispatch(
  this: OrchestrationDb,
  runId: string
): string[] {
  return queryTeamRows(
    this.db,
    z.object({ member_id: z.string() }),
    `SELECT DISTINCT r.assignee_member_id AS member_id
     FROM dispatch_contexts d
     JOIN team_task_refs r ON r.task_id = d.task_id
     WHERE d.run_id = ? AND d.status IN ('pending', 'dispatched')
       AND r.assignee_member_id IS NOT NULL`,
    runId
  ).map((row) => row.member_id)
}

const TeamMemberDispatchConflictSchema = z.object({
  dispatch_id: z.string(),
  task_id: z.string(),
  member_id: z.string()
})

/**
 * Another Dispatch already attached to a terminal for a different task of the member `taskId` is
 * assigned to. Attached only: two starts racing for one member must not refuse each other.
 */
export function findTeamMemberDispatchConflict(
  this: OrchestrationDb,
  taskId: string,
  dispatchId: string
): z.infer<typeof TeamMemberDispatchConflictSchema> | undefined {
  return queryTeamRow(
    this.db,
    TeamMemberDispatchConflictSchema,
    `SELECT d.id AS dispatch_id, d.task_id, own.assignee_member_id AS member_id
     FROM team_task_refs own
     JOIN team_task_refs other
       ON other.assignee_member_id = own.assignee_member_id AND other.task_id <> own.task_id
     JOIN dispatch_contexts d ON d.task_id = other.task_id
     WHERE own.task_id = ? AND own.assignee_member_id IS NOT NULL
       AND d.status IN ('pending', 'dispatched') AND d.assignee_handle IS NOT NULL AND d.id <> ?
     LIMIT 1`,
    taskId,
    dispatchId
  )
}

/** How many unfinished tasks each member of the team holds. */
export function countTeamMemberOpenTasks(
  this: OrchestrationDb,
  teamId: string
): Map<string, number> {
  const rows = queryTeamRows(
    this.db,
    z.object({ member_id: z.string(), open: z.number() }),
    `SELECT r.assignee_member_id AS member_id, COUNT(*) AS open
     FROM team_task_refs r
     JOIN tasks t ON t.id = r.task_id
     WHERE r.team_id = ? AND r.kind = 'task' AND r.assignee_member_id IS NOT NULL
       AND t.status NOT IN ('completed', 'failed')
     GROUP BY r.assignee_member_id`,
    teamId
  )
  return new Map(rows.map((row) => [row.member_id, row.open]))
}

export type TeamAssignedWorkStoreMethods = {
  listStartableTeamTasks: typeof listStartableTeamTasks
  listTeamAssignedBacklog: typeof listTeamAssignedBacklog
  listTeamMemberIdsWithActiveDispatch: typeof listTeamMemberIdsWithActiveDispatch
  findTeamMemberDispatchConflict: typeof findTeamMemberDispatchConflict
  countTeamMemberOpenTasks: typeof countTeamMemberOpenTasks
}

export function attachTeamAssignedWorkStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    listStartableTeamTasks,
    listTeamAssignedBacklog,
    listTeamMemberIdsWithActiveDispatch,
    findTeamMemberDispatchConflict,
    countTeamMemberOpenTasks
  })
}
