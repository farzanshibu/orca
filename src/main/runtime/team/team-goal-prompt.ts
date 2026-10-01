import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { TeamMemberLiveness } from './team-member-liveness'
import type { TeamWorkspaceFacts } from './team-workspace-facts'

export const TEAM_GOAL_QUEUE_SOURCE = 'goal'
export const TEAM_GOAL_REVIEW_QUEUE_SOURCE = 'goal-review'

const planningHeading = (ref: string): string => `GOAL ${ref}:`
const reviewHeading = (ref: string): string => `REVIEW GOAL ${ref}:`

/**
 * Drops what is still queued for the manager about a goal: its review nudge, and with
 * `planning` its planning prompt too. A prompt typed after the goal moved on asks for stale work.
 */
export function dropQueuedTeamGoalPrompts(
  db: OrchestrationDb,
  team: TeamRow,
  ref: string,
  options: { planning: boolean }
): void {
  const manager = db.getTeamManager(team.id)
  for (const item of manager ? db.listPendingTeamQueue(manager.id) : []) {
    const review =
      item.source === TEAM_GOAL_REVIEW_QUEUE_SOURCE && item.text.startsWith(reviewHeading(ref))
    const planning =
      options.planning &&
      item.source === TEAM_GOAL_QUEUE_SOURCE &&
      item.text.startsWith(planningHeading(ref))
    if (review || planning) {
      db.removeTeamQueueItem(item.id)
    }
  }
}

export type TeamGoalPromptMember = {
  member: TeamMemberRow
  liveness: TeamMemberLiveness
  /** Unfinished tasks the member already holds. */
  openTasks: number
}

function memberState(entry: TeamGoalPromptMember): string {
  if (entry.member.paused_at) {
    return 'paused by the human, takes no work'
  }
  if (entry.liveness === 'stopped') {
    return 'not running, its tasks wait until the human starts it'
  }
  return entry.liveness === 'unverifiable' ? 'no recent update' : 'running'
}

function rosterLine(entry: TeamGoalPromptMember): string {
  const { member, openTasks } = entry
  const load = openTasks === 1 ? '1 open task' : `${openTasks} open tasks`
  return `- ${member.slug} (${member.role_slug}, ${member.agent}): ${memberState(entry)}, ${load}`
}

/** How finished work comes together, which differs between worktrees and one shared folder. */
function integrationStep(kind: TeamWorkspaceFacts['kind']): string {
  return kind === 'folder'
    ? 'check that the pieces fit together in the shared folder; there is nothing to merge'
    : "merge each member's branch, through your git host's pull or merge requests or locally"
}

/**
 * The prompt a new goal queues for the manager: who can take work and how loaded they are, where
 * the team works, and the one command that files a task Orca will start by itself.
 */
export function buildTeamGoalPrompt(args: {
  team: TeamRow
  goal: { ref: string; title: string; spec: string }
  roster: readonly TeamGoalPromptMember[]
  workspace: TeamWorkspaceFacts
}): string {
  const { team, goal, roster, workspace } = args
  const { cli } = workspace
  const folder = workspace.kind === 'folder'
  return [
    `${planningHeading(goal.ref)} ${goal.title}`,
    goal.spec.trim() !== goal.title.trim() ? goal.spec.trim() : null,
    '',
    "Plan this goal into tasks with one owner each. Orca starts every task in its owner's own",
    'terminal once the tasks it depends on are done and the owner is free. Do not dispatch them.',
    '',
    'Who can take tasks:',
    ...(roster.length > 0
      ? roster.map(rosterLine)
      : [`- nobody yet; propose a hire with \`${cli} team hire-propose\` and tell the human`]),
    '',
    folder
      ? "Workspace: every member works in the same folder, with no branches. Split the work by path so no two members edit the same files, and name each task's paths in its spec."
      : 'Workspace: each member has its own git worktree and branch. Keep their files apart where you can; you merge the branches at the end.',
    '',
    'File each task:',
    `  ${cli} team task add --team ${team.id} --goal ${goal.ref} --title "<short title>" --spec "<objective, expected output, boundaries>" --assignee <slug> [--deps <ref,ref>]`,
    '--deps lists the tasks that must finish first. Leave it out for work that can start now, so members work at the same time.',
    '',
    `When every task is done Orca asks you to review. Then ${integrationStep(workspace.kind)}, and close the goal:`,
    `  ${cli} team goal close --team ${team.id} --goal ${goal.ref} --summary "<what was delivered>"`,
    'Add --cancel to stop a goal that should not finish.'
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

/** The one nudge a manager gets once every task of a goal is done. */
export function buildTeamGoalReviewNudge(args: {
  team: TeamRow
  goal: { ref: string; title: string; total: number }
  workspace: TeamWorkspaceFacts
}): string {
  const { team, goal, workspace } = args
  const tasks = goal.total === 1 ? 'Its task is' : `All ${goal.total} of its tasks are`
  return [
    `${reviewHeading(goal.ref)} ${goal.title}`,
    `${tasks} done. Review the work, then ${integrationStep(workspace.kind)}.`,
    `If something is missing, file another task under the goal with \`${workspace.cli} team task add --team ${team.id} --goal ${goal.ref} ...\`; Orca asks again once it is done.`,
    'Otherwise close the goal:',
    `  ${workspace.cli} team goal close --team ${team.id} --goal ${goal.ref} --summary "<what was delivered>"`
  ].join('\n')
}
