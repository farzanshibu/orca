// Mirrors the host's `orchestration.teamShow` reply; statuses stay strings so a newer host's value renders as text.
// Optional fields are ones an older host does not send.

import type { TeamClosingWaitReason } from '../../../../shared/team-closing-wait'
import type { TeamDispatchWaitReason } from '../../../../shared/team-task-assignment'

export type TeamSummary = {
  id: string
  repo_id: string
  name: string
  run_id: string
  charter: string
  status: string
  task_prefix: string
  closing_at?: string | null
}

export type TeamListEntry = TeamSummary & { memberCount: number; pendingHires: number }

export type TeamQueueItem = { id: string; member_id: string; text: string; created_at: string }

/** The task a member's terminal holds an active Dispatch for. */
export type TeamMemberCurrentTask = { task_id: string; ref: string | null; dispatch_id: string }

export type TeamMember = {
  id: string
  slug: string
  display_name: string
  role_slug: string
  role_brief: string
  agent: string
  model: string | null
  effort: string | null
  is_manager: number
  /** JSON TeamMemberCapabilities. */
  capabilities: string
  desired_state: string
  paused_at: string | null
  pause_reason: string | null
  spend_usd: number | null
  spend_tokens: number | null
  spend_cap_usd: number | null
  token_cap: number | null
  worktree_id: string | null
  pane_key: string | null
  live_handle: string | null
  liveness: string
  agent_status: string | null
  queue: TeamQueueItem[]
  current_task?: TeamMemberCurrentTask | null
  /** Why this member's assigned task has not started. */
  waiting_reason?: TeamDispatchWaitReason | (string & {}) | null
}

export type TeamTask = {
  id: string
  ref: string | null
  task_title: string | null
  spec: string
  status: string
  assignee_handle: string | null
  created_at: string
  completed_at: string | null
  parent_id?: string | null
  /** JSON array of the task ids this one waits on. */
  deps?: string
  dispatch_id?: string | null
  kind?: string
  assignee_member_id?: string | null
}

export type TeamGoal = {
  id: string
  ref: string | null
  title: string
  status: string
  progress?: { done: number; total: number }
  review_requested_at?: string | null
}

export type TeamPendingQuestion = {
  message_id: string
  asker_handle: string
  subject: string
  body: string
  created_at: string
  asker_member_id?: string | null
}

export type TeamPendingGate = {
  id: string
  task_id: string
  question: string
  options: string
  member_id?: string | null
  task_ref?: string | null
}

export type TeamHireProposal = {
  id: string
  slug: string
  display_name: string
  role_slug: string
  role_brief: string
  agent: string
  model: string | null
  rationale: string
  proposed_by_member_id?: string | null
}

/** A member Closing Time still waits on. */
export type TeamClosingWaitEntry = {
  member_id: string
  reason: TeamClosingWaitReason | (string & {})
}

export type TeamSnapshot = {
  team: TeamSummary
  members: TeamMember[]
  tasks: TeamTask[]
  pendingQuestions: TeamPendingQuestion[]
  pendingGates: TeamPendingGate[]
  pendingHires: TeamHireProposal[]
  goals?: TeamGoal[]
  /** Set while Closing Time runs: who the wind-down still waits on. */
  closing?: { waiting_on?: TeamClosingWaitEntry[] } | null
  /** Newest `orchestration.teamActivity` sequence the snapshot reflects. */
  activity_sequence?: number
}

export type TeamLogMessage = {
  id: string
  from_handle: string
  to_handle: string
  subject: string
  body: string
  type: string
  priority: string
  sequence: number
  created_at: string
  thread_id?: string | null
}

/** The member a handle belongs to, for labelling log lines. */
export function teamMemberForHandle(
  members: readonly TeamMember[],
  handle: string | null
): TeamMember | undefined {
  return handle ? members.find((member) => member.live_handle === handle) : undefined
}

export function formatUsd(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(2)}`
}
