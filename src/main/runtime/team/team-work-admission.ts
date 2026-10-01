import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { RunRow } from '../orchestration/types'

/**
 * Refuses a dispatch a team must not take: into a paused team's Run, onto a paused member's
 * terminal from any Run, or of a goal, which the manager splits into tasks and is never worked
 * itself. Every door that starts a dispatch calls this, so none can route around the team.
 */
export function assertTeamAcceptsWorkerStart(args: {
  db: OrchestrationDb
  run: RunRow
  terminal: string | undefined
  taskId: string | undefined
}): void {
  const { db, run, terminal, taskId } = args
  if (taskId && db.getTeamTaskMeta(taskId)?.kind === 'goal') {
    throw new OrchestrationError(
      'invalid_argument',
      'A goal is split into tasks by the manager; dispatch its tasks instead.',
      { taskId }
    )
  }
  const team = db.getTeamByRunId(run.id)
  if (team && team.status !== 'active') {
    throw new OrchestrationError(
      'team_paused',
      `Team ${team.name} is ${team.status}; the operator must resume it before new work starts.`,
      { teamId: team.id }
    )
  }
  const member = terminal ? db.findTeamMemberByTerminal(terminal) : undefined
  if (member?.paused_at) {
    throw new OrchestrationError(
      'team_paused',
      `Team member ${member.slug} is paused by the operator; dispatch to another member.`,
      { memberId: member.id }
    )
  }
}
