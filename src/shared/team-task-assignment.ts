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

/**
 * Waits only the scheduler decides: `member_needs_input` (the member's agent waits on a human),
 * `team_at_capacity` (the team's `max_parallel` is reached), `retry_backoff` (a start failed and
 * Orca waits before the next try), `escalated` (starts kept failing; the manager was told and must
 * assign the task again), and `task_taken` (already started or no longer this member's).
 */
export const TEAM_SCHEDULER_WAIT_REASONS = [
  'member_needs_input',
  'team_at_capacity',
  'retry_backoff',
  'escalated',
  'task_taken'
] as const
export type TeamSchedulerWaitReason = (typeof TEAM_SCHEDULER_WAIT_REASONS)[number]

export type TeamWorkWaitReason = TeamDispatchWaitReason | TeamSchedulerWaitReason

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
  waiting?: TeamWorkWaitReason | (string & {})
  /** Set when the start was attempted and failed. */
  error?: string
  dispatchId?: string | null
}
