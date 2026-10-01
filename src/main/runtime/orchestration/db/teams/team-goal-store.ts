import { z } from 'zod'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRows } from './team-row-query'

const TeamGoalRowSchema = z.object({
  task_id: z.string(),
  team_id: z.string(),
  number: z.number(),
  task_title: z.string().nullable(),
  spec: z.string(),
  status: z.string(),
  completed_at: z.string().nullable(),
  review_requested_at: z.string().nullable(),
  total: z.number(),
  done: z.number()
})
/** A goal with how many of its tasks exist and how many are finished. */
export type TeamGoalRow = z.infer<typeof TeamGoalRowSchema>

const GOAL_COLUMNS_SQL = `r.task_id, r.team_id, r.number, g.task_title, g.spec, g.status,
  g.completed_at, r.review_requested_at,
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = g.id) AS total,
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = g.id AND c.status = 'completed') AS done`

const unfinishedChildSql = (goalId: string): string =>
  `EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = ${goalId} AND c.status <> 'completed')`

export function listTeamGoals(this: OrchestrationDb, teamId: string): TeamGoalRow[] {
  return queryTeamRows(
    this.db,
    TeamGoalRowSchema,
    `SELECT ${GOAL_COLUMNS_SQL}
     FROM team_task_refs r
     JOIN tasks g ON g.id = r.task_id
     WHERE r.team_id = ? AND r.kind = 'goal'
     ORDER BY r.number`,
    teamId
  )
}

/** Open goals of working teams whose tasks have all finished and whose manager was not yet asked. */
export function listTeamGoalsAwaitingReview(this: OrchestrationDb): TeamGoalRow[] {
  return queryTeamRows(
    this.db,
    TeamGoalRowSchema,
    `SELECT ${GOAL_COLUMNS_SQL}
     FROM team_task_refs r
     JOIN tasks g ON g.id = r.task_id
     JOIN teams tm ON tm.id = r.team_id
     WHERE r.kind = 'goal' AND r.review_requested_at IS NULL
       AND g.status NOT IN ('completed', 'failed')
       AND tm.status = 'active' AND tm.closing_at IS NULL
       AND EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = g.id)
       AND NOT ${unfinishedChildSql('g.id')}
     ORDER BY r.team_id, r.number`
  )
}

/**
 * Forgets a review request once the goal has an unfinished task again, whoever added or reopened
 * it: tasks enter a Run through many writers, so this is checked rather than hooked into each.
 */
export function rearmTeamGoalReviews(this: OrchestrationDb): number {
  return Number(
    this.db
      .prepare(
        `UPDATE team_task_refs SET review_requested_at = NULL
         WHERE kind = 'goal' AND review_requested_at IS NOT NULL
           AND ${unfinishedChildSql('team_task_refs.task_id')}`
      )
      .run().changes
  )
}

const TeamGoalChildSchema = z.object({ id: z.string(), status: z.string() })

export function listTeamGoalChildren(
  this: OrchestrationDb,
  goalId: string
): z.infer<typeof TeamGoalChildSchema>[] {
  return queryTeamRows(
    this.db,
    TeamGoalChildSchema,
    'SELECT id, status FROM tasks WHERE parent_id = ? ORDER BY created_at, rowid',
    goalId
  )
}

export type TeamGoalStoreMethods = {
  listTeamGoals: typeof listTeamGoals
  listTeamGoalsAwaitingReview: typeof listTeamGoalsAwaitingReview
  rearmTeamGoalReviews: typeof rearmTeamGoalReviews
  listTeamGoalChildren: typeof listTeamGoalChildren
}

export function attachTeamGoalStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    listTeamGoals,
    listTeamGoalsAwaitingReview,
    rearmTeamGoalReviews,
    listTeamGoalChildren
  })
}
