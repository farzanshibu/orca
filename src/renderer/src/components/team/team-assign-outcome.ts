import { translate } from '@/i18n/i18n'
import type { TeamTaskAssignResult } from '../../../../shared/team-task-assignment'
import { teamWaitReasonLabel } from './team-enum-labels'
import type { TeamMember, TeamTask } from './team-snapshot-types'

/** What `orchestration.teamTaskAssign` answered for a card, with the member it was asked for. */
export type TeamAssignRecord = { memberId: string; result: TeamTaskAssignResult }

export type TeamAssignNote = { tone: 'neutral' | 'error'; text: string }

/** The host refuses a task that is running or finished, and a goal, which is never worked itself. */
export function canAssignTeamTask(task: Pick<TeamTask, 'status' | 'kind'>): boolean {
  return task.kind !== 'goal' && task.status !== 'dispatched' && task.status !== 'completed'
}

/** Everyone a task can go to. The manager coordinates and is refused by the host. */
export function assignableTeamMembers(members: readonly TeamMember[]): TeamMember[] {
  return members.filter((member) => !member.is_manager)
}

/** The outcome of an assignment in words: started, why it waits, or why the start failed. */
export function teamAssignNote(result: TeamTaskAssignResult): TeamAssignNote | null {
  if (!result.assigned) {
    return null
  }
  if (result.error) {
    return {
      tone: 'error',
      text: translate('team.assign.failed', 'Could not start: {{error}}', { error: result.error })
    }
  }
  if (result.started) {
    return { tone: 'neutral', text: translate('team.assign.started', 'Started') }
  }
  return {
    tone: 'neutral',
    text:
      teamWaitReasonLabel(result.waiting) ||
      translate('team.assign.assigned', 'Assigned, not started yet')
  }
}

/**
 * Whether an answer still describes the card. It stops doing so once the task went to someone
 * else, finished, or (for an answer that was not "started") began running after all.
 */
export function isTeamAssignRecordCurrent(
  task: Pick<TeamTask, 'status' | 'assignee_member_id'>,
  record: TeamAssignRecord
): boolean {
  if (task.assignee_member_id !== record.memberId || task.status === 'completed') {
    return false
  }
  return record.result.started ? task.status === 'dispatched' : task.status !== 'dispatched'
}

const UNSTARTED_STATUSES = new Set(['pending', 'ready', 'blocked', 'failed'])

/**
 * Why an assigned card has not started, from the snapshot. The host reports one reason per member,
 * for the task that member starts next, so it is shown only when the member has a single unstarted
 * task and the reason can be about no other.
 */
export function teamTaskStandingWait(
  task: Pick<TeamTask, 'id' | 'status' | 'assignee_member_id'>,
  owner: Pick<TeamMember, 'id' | 'waiting_reason'> | undefined,
  tasks: readonly Pick<TeamTask, 'id' | 'status' | 'assignee_member_id' | 'kind'>[]
): string | null {
  if (!owner?.waiting_reason || task.assignee_member_id !== owner.id) {
    return null
  }
  const unstarted = tasks.filter(
    (other) =>
      other.kind !== 'goal' &&
      other.assignee_member_id === owner.id &&
      UNSTARTED_STATUSES.has(other.status)
  )
  return unstarted.length === 1 && unstarted[0].id === task.id ? owner.waiting_reason : null
}
