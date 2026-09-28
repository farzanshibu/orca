import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { RunRow } from '../orchestration/types'

/**
 * Refuses a worker start that a paused team or a paused member must not take: a dispatch into a
 * paused team's Run, or onto a paused member's terminal from any Run.
 */
export function assertTeamAcceptsWorkerStart(args: {
  db: OrchestrationDb
  run: RunRow
  terminal: string | undefined
}): void {
  const { db, run, terminal } = args
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
