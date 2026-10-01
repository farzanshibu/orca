/**
 * One thing that happened on a team, as `orchestration.teamActivity` returns it. Kinds, parties,
 * channels, and statuses are open strings: a newer host adds values, and a client renders one it
 * does not know as a plain row rather than dropping it.
 *
 * Kinds today: message, delivery, task_created, task_assigned, task_status, task_settled,
 * dispatch_started, dispatch_failed, goal_created, goal_review, goal_closed, hire_proposed,
 * hire_decided, member_added, member_state, member_paused, member_resumed.
 * Parties today: member, operator, external, system, agent, team.
 */
export type TeamActivityEvent = {
  /** Monotonic per host; the poll cursor. A merged group send carries its last row's sequence. */
  sequence: number
  id: string
  kind: string
  channel: string | null
  status: string | null
  message_type: string | null
  message_id: string | null
  task_id: string | null
  /** The task's short ref, like `bmt-12`. */
  task_ref: string | null
  /** The goal this task belongs to, or the task itself when it is a goal. */
  goal_id: string | null
  dispatch_id: string | null
  thread_id: string | null
  from: { party: string; member_id: string | null }
  /** One group send is one event naming every recipient. */
  to: { party: string; member_ids: string[] }
  subject: string
  body_preview: string | null
  created_at: string
}

export type TeamActivityPage = {
  /** Oldest first. */
  events: TeamActivityEvent[]
  /** Pass as `afterSequence` on the next poll. */
  latestSequence: number
  hasMore: boolean
  /** The cursor was older than what the host still keeps; these are the newest events instead. */
  reset: boolean
}
