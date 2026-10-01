import type { TeamTaskAssignResult } from './team-task-assignment'

/** A goal as `orchestration.teamShow` lists it. `status` is open, completed, or cancelled today. */
export type TeamGoalSummary = {
  id: string
  ref: string | null
  title: string
  status: string
  /** How many of the goal's tasks are finished, of how many exist. */
  progress: { done: number; total: number }
  /** Set once the manager was asked to review; cleared when a task is added or reopened. */
  review_requested_at: string | null
}

/** What `orchestration.teamGoalCreate` returns. */
export type TeamGoalCreateResult = {
  goalId: string
  ref: string | null
  title: string
  /** Whether a planning prompt was queued for the manager. */
  queued: boolean
}

/** What `orchestration.teamGoalClose` returns. */
export type TeamGoalCloseResult = {
  goalId: string
  ref: string | null
  status: 'completed' | 'cancelled'
  /** Tasks that had not started and were cancelled with the goal. */
  cancelledTasks: number
  /** Tasks still running when the goal was cancelled; they finish on their own. */
  runningTasks: number
}

/** What `orchestration.teamTaskCreate` returns. */
export type TeamTaskCreateResult = {
  enriched: boolean
  taskId: string | null
  ref?: string | null
  /** The goal the task was filed under. */
  goalId?: string
  /** Present when the task was created with an assignee. */
  assignment?: TeamTaskAssignResult
}
