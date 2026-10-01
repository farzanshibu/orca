import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'

export type TeamTrigger = {
  /** Shown as the sender, e.g. `mission:standup` or `webhook`. */
  source: string
  text: string
  /** `manager`, `@all`, or a member slug. */
  target: string
  task?: { title: string; spec: string }
}

function resolveTriggerTargets(
  db: OrchestrationDb,
  team: TeamRow,
  target: string
): TeamMemberRow[] {
  if (target === '@all') {
    return db.listTeamMembers(team.id).filter((member) => !member.paused_at)
  }
  const member =
    target === 'manager' ? db.getTeamManager(team.id) : db.findTeamMemberBySlug(team.id, target)
  if (!member) {
    throw new OrchestrationError(
      'team_member_not_found',
      target === 'manager'
        ? `Team ${team.name} has no manager to receive ${target} triggers.`
        : `Team ${team.name} has no member "${target}".`
    )
  }
  return [member]
}

/**
 * Brings outside work into a team: logged for the inbox's "from outside" queue, queued for each
 * target so it arrives when the agent is idle, and — only when the team allows it — a new task.
 */
export function acceptTeamTrigger(
  db: OrchestrationDb,
  team: TeamRow,
  trigger: TeamTrigger
): { queued: number; taskId: string | null } {
  if (team.status !== 'active') {
    throw new OrchestrationError('team_paused', `Team ${team.name} is ${team.status}.`)
  }
  const targets = resolveTriggerTargets(db, team, trigger.target)
  const logged = db.insertMessage({
    from: `external:${trigger.source}`,
    to: `run:${team.run_id}`,
    subject: trigger.text.split('\n')[0].slice(0, 120),
    body: trigger.text,
    type: 'status',
    runId: team.run_id
  })
  // The queue delivers it; leaving the mail unread would hand it to the manager twice.
  db.markAsRead([logged.id])
  let taskId: string | null = null
  if (trigger.task && team.trigger_mode === 'allow-all') {
    taskId = db.createTask({
      runId: team.run_id,
      spec: trigger.task.spec,
      taskTitle: trigger.task.title
    }).id
  }
  const text = `[${trigger.source}] ${trigger.text}${taskId ? `\n(Created task ${taskId}.)` : ''}`
  for (const member of targets) {
    db.enqueueTeamMemberMessage(member.id, text, trigger.source)
  }
  return { queued: targets.length, taskId }
}
