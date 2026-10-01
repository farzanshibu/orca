/**
 * Why an assigned task has not started yet. Each clears on its own, so Orca keeps trying:
 * `deps` (a task it depends on is unfinished), `task_blocked` (a decision gate is open on it),
 * `team_inactive` (the team is paused or closing), and the member or manager states.
 */
export const TEAM_DISPATCH_WAIT_REASONS = [
  'deps',
  'task_blocked',
  'member_busy',
  'member_paused',
  'member_not_running',
  'member_unverifiable',
  'manager_not_running',
  'team_inactive'
] as const
export type TeamDispatchWaitReason = (typeof TEAM_DISPATCH_WAIT_REASONS)[number]

/** What `orchestration.teamTaskAssign` returns. `waiting` is a string so a newer host's reason still reads. */
export type TeamTaskAssignResult = {
  taskId: string
  ref: string
  /** The assignee's slug, or null after `--unassign`. */
  member: string | null
  /** Whether the task now has an assignee. */
  assigned: boolean
  /** Whether a Dispatch started for it in this call. */
  started: boolean
  waiting?: TeamDispatchWaitReason | (string & {})
  /** Set when the start was attempted and failed. */
  error?: string
  dispatchId?: string | null
}
