import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'

export const TEAM_BREAKER_REASONS = ['spend_cap', 'token_cap', 'tool_loop'] as const
export type TeamBreakerReason = (typeof TEAM_BREAKER_REASONS)[number]

export type TeamBreakerEffects = {
  interruptMember: (member: TeamMemberRow) => Promise<void>
  notifyMailbox: (mailbox: string) => void
}

/**
 * Stops a member the same way for every breaker: pause (so no new work lands), interrupt its turn,
 * and tell the manager's mailbox. Only the human resumes a tripped member.
 */
export async function tripTeamBreaker(args: {
  db: OrchestrationDb
  effects: TeamBreakerEffects
  team: TeamRow
  member: TeamMemberRow
  reason: TeamBreakerReason
  detail: string
}): Promise<void> {
  const { db, effects, team, member, reason, detail } = args
  if (member.paused_at) {
    return
  }
  db.setTeamMemberPaused(member.id, true, reason)
  await effects.interruptMember(member)
  const mailbox = `run:${team.run_id}`
  db.insertMessage({
    from: 'orca:breaker',
    to: mailbox,
    subject: `Breaker: ${member.slug} paused (${detail})`,
    body: `${member.display_name} was interrupted and paused by the ${reason.replace('_', ' ')} breaker. Only the human can resume it.`,
    type: 'escalation',
    priority: 'urgent',
    runId: team.run_id
  })
  effects.notifyMailbox(mailbox)
}
