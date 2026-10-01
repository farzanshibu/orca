import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'

/** How long Orca waits after the first and the second failed start; a third is escalated instead. */
export const TEAM_START_RETRY_DELAYS_MS = [60_000, 300_000] as const

export const TEAM_SCHEDULER_SENDER = 'orca:team-scheduler'

/**
 * Counts one failed start of an assigned task: back off, or after the last allowed try stop and
 * tell the manager, who restarts it by assigning the task again.
 */
export function noteTeamTaskStartFailure(args: {
  db: OrchestrationDb
  team: TeamRow
  member: TeamMemberRow
  taskId: string
  /** The failed Dispatch, or null when the start failed before one existed. */
  dispatchId: string | null
  error: string
  now: number
  notifyMailbox: (mailbox: string) => void
}): void {
  const { db, team, member, taskId } = args
  const meta = db.getTeamTaskMeta(taskId)
  if (!meta) {
    return
  }
  const failures = meta.start_failures + 1
  const delay = TEAM_START_RETRY_DELAYS_MS.at(failures - 1)
  db.recordTeamTaskStartFailure(taskId, {
    retryAt: delay === undefined ? null : new Date(args.now + delay).toISOString(),
    escalated: delay === undefined,
    dispatchId: args.dispatchId
  })
  if (delay !== undefined) {
    return
  }
  const ref = `${team.task_prefix}-${meta.number}`
  const mailbox = `run:${team.run_id}`
  db.insertMessage({
    from: TEAM_SCHEDULER_SENDER,
    to: mailbox,
    subject: `${ref} did not start on ${member.slug} after ${failures} tries`,
    body: [
      `Last error: ${args.error}`,
      'Orca has stopped retrying. Fix the cause, then assign the task again, to the same member',
      `or another, to restart it: team task assign --team ${team.id} --task ${ref} --member <slug>`
    ].join('\n'),
    type: 'escalation',
    priority: 'high',
    runId: team.run_id
  })
  args.notifyMailbox(mailbox)
}
