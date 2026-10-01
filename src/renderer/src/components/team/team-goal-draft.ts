import { getScreenSubmitModifierLabel } from '@/lib/screen-submit-shortcut'
import { ORCHESTRATION_TASK_TITLE_MAX_LENGTH } from '../../../../shared/orchestration-task-display'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamMember, TeamSummary } from './team-snapshot-types'

/** Whether the host can take goals. `unknown` until it has answered, and after a probe that failed. */
export type TeamFanoutSupport = 'unknown' | 'supported' | 'unsupported'

export type TeamGoalBlocker =
  | 'host_unsupported'
  | 'team_closing'
  | 'team_paused'
  | 'team_inactive'
  | 'no_manager'

/**
 * Why the host would refuse a goal right now, read from what the page already shows, so the dialog
 * says it before the user types. An unprobed host is not a blocker: its answer to the call decides.
 */
export function teamGoalBlocker(args: {
  support: TeamFanoutSupport
  team: Pick<TeamSummary, 'status' | 'closing_at'>
  members: readonly Pick<TeamMember, 'is_manager'>[]
}): TeamGoalBlocker | null {
  const { support, team, members } = args
  if (support === 'unsupported') {
    return 'host_unsupported'
  }
  if (team.closing_at) {
    return 'team_closing'
  }
  if (team.status !== 'active') {
    return team.status === 'paused' ? 'team_paused' : 'team_inactive'
  }
  return members.some((member) => member.is_manager) ? null : 'no_manager'
}

export function canSubmitTeamGoal(args: {
  text: string
  busy: boolean
  blocker: TeamGoalBlocker | null
}): boolean {
  return !args.busy && args.blocker === null && args.text.trim().length > 0
}

const TITLE_ELLIPSIS = '…'

function shortenToTaskTitle(line: string): string {
  if (line.length <= ORCHESTRATION_TASK_TITLE_MAX_LENGTH) {
    return line
  }
  const room = ORCHESTRATION_TASK_TITLE_MAX_LENGTH - TITLE_ELLIPSIS.length
  let cut = line.slice(0, room)
  const lastSpace = cut.lastIndexOf(' ')
  // Ends on a whole word when that keeps most of the title; one long unbroken run is cut where it is.
  if (line[room] !== ' ' && lastSpace >= room / 2) {
    cut = cut.slice(0, lastSpace)
  }
  const lastCode = cut.charCodeAt(cut.length - 1)
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    cut = cut.slice(0, -1)
  }
  return `${cut.replace(/[\s,;:.!?-]+$/, '')}${TITLE_ELLIPSIS}`
}

/**
 * What to send for a goal typed as free text. The host caps a title at
 * `ORCHESTRATION_TASK_TITLE_MAX_LENGTH`, so anything longer than one short line goes as a short
 * title plus the whole text as the spec, which is what the manager and the members read.
 */
export function splitTeamGoalText(text: string): { title: string; spec?: string } {
  const whole = text.trim()
  const lines = whole.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, ' '))
  const firstLine = lines.find(Boolean) ?? ''
  if (lines.length === 1 && firstLine.length <= ORCHESTRATION_TASK_TITLE_MAX_LENGTH) {
    return { title: firstLine }
  }
  return { title: shortenToTaskTitle(firstLine), spec: whole }
}

export type TeamGoalDelivery =
  | 'when_idle'
  | 'manager_paused'
  | 'manager_stopped'
  | 'manager_silent'
  | 'behind_queue'

/**
 * When the manager will get a queued goal. Orca types a queued prompt only into a running, idle,
 * unpaused agent, so anything else leaves the goal waiting and the dialog must say so.
 */
export function teamGoalDelivery(
  manager: Pick<TeamMember, 'paused_at' | 'liveness' | 'live_handle' | 'desired_state' | 'queue'>
): TeamGoalDelivery {
  if (manager.paused_at) {
    return 'manager_paused'
  }
  const liveness = teamMemberLiveness(manager)
  if (liveness === 'stopped') {
    return 'manager_stopped'
  }
  if (liveness === 'unverifiable') {
    return 'manager_silent'
  }
  // One queued prompt goes out per idle turn, oldest first.
  return manager.queue.length > 0 ? 'behind_queue' : 'when_idle'
}

/** The key caps for the chord `isScreenSubmitShortcut` accepts on this platform. */
export function teamGoalSubmitShortcutKeys(): string[] {
  return [getScreenSubmitModifierLabel(), 'Enter']
}
