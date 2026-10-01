import type { OrchestrationDb } from '../orchestration/db'
import type { TeamGoalRow } from '../orchestration/db/teams/team-goal-store'
import type { TeamRow } from '../orchestration/team-types'
import {
  TEAM_GOAL_REVIEW_QUEUE_SOURCE,
  buildTeamGoalReviewNudge,
  dropQueuedTeamGoalPrompts
} from './team-goal-prompt'
import type { TeamWorkspaceFacts } from './team-workspace-facts'

/** A goal's display title: its own, or the first line of what was asked. */
export function teamGoalTitle(goal: Pick<TeamGoalRow, 'task_title' | 'spec'>): string {
  return goal.task_title?.trim() || (goal.spec.trim().split('\n')[0] ?? '')
}

/**
 * Asks each manager, once, to review a goal whose tasks are all done. A task added or reopened
 * re-arms it, so the manager is asked again when that one finishes too.
 */
export async function requestDueTeamGoalReviews(args: {
  db: OrchestrationDb
  workspaceFacts: (team: TeamRow) => Promise<TeamWorkspaceFacts>
}): Promise<number> {
  const { db } = args
  db.rearmTeamGoalReviews()
  let requested = 0
  for (const goal of db.listTeamGoalsAwaitingReview()) {
    const team = db.getTeam(goal.team_id)
    const manager = team ? db.getTeamManager(team.id) : undefined
    if (!team || !manager) {
      // Nobody to ask yet; the goal is asked about once a manager exists.
      continue
    }
    // A team whose repository cannot be read must not hold up the goals of the teams after it.
    const workspace = await args.workspaceFacts(team).catch(() => null)
    // Re-read after the await: a concurrent pass may have asked, and nothing below awaits.
    if (!workspace || db.getTeamTaskMeta(goal.task_id)?.review_requested_at) {
      continue
    }
    const title = teamGoalTitle(goal)
    const ref = `${team.task_prefix}-${goal.number}`
    db.setTeamGoalReviewRequested(goal.task_id, true)
    // An earlier nudge the manager never got to is replaced, not doubled.
    dropQueuedTeamGoalPrompts(db, team, ref, { planning: false })
    db.enqueueTeamMemberMessage(
      manager.id,
      buildTeamGoalReviewNudge({ team, goal: { ref, title, total: goal.total }, workspace }),
      TEAM_GOAL_REVIEW_QUEUE_SOURCE
    )
    db.recordTeamActivity({
      teamId: team.id,
      kind: 'goal_review',
      status: 'requested',
      taskId: goal.task_id,
      from: { party: 'system' },
      to: { party: 'member', memberId: manager.id },
      subject: title,
      detail: `${goal.done} of ${goal.total} tasks done`
    })
    requested += 1
  }
  return requested
}
