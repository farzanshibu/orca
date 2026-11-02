import { teamMemberForHandle, type TeamMember, type TeamTask } from './team-snapshot-types'

type OwnedTask = Pick<TeamTask, 'assignee_member_id' | 'assignee_handle'>

/**
 * The member a task belongs to: the recorded assignee, else whoever holds its Dispatch handle.
 * The handle is the fallback because it is reminted on restart and absent before a task starts.
 */
export function teamTaskOwner(
  task: OwnedTask,
  members: readonly TeamMember[]
): TeamMember | undefined {
  const assignee = task.assignee_member_id
    ? members.find((member) => member.id === task.assignee_member_id)
    : undefined
  return assignee ?? teamMemberForHandle(members, task.assignee_handle)
}

export function teamTaskSettled(task: Pick<TeamTask, 'status'>): boolean {
  return task.status === 'completed' || task.status === 'failed'
}

/** Every ticket this member owns, open ones first so the sheet leads with what is left. */
export function teamMemberOwnedTasks(
  member: TeamMember,
  tasks: readonly TeamTask[],
  members: readonly TeamMember[]
): TeamTask[] {
  return tasks
    .filter((task) => teamTaskOwner(task, members)?.id === member.id)
    .sort((a, b) => Number(teamTaskSettled(a)) - Number(teamTaskSettled(b)))
}

/** The task a member is working right now: the host's answer, else the Dispatch on its handle. */
export function teamMemberCurrentTask(
  member: Pick<TeamMember, 'current_task' | 'live_handle'>,
  tasks: readonly TeamTask[]
): TeamTask | undefined {
  const current = member.current_task
  if (current) {
    return tasks.find((task) => task.id === current.task_id)
  }
  // An older host sends no `current_task`; null from a newer one means it holds no Dispatch.
  if (current === null || !member.live_handle) {
    return undefined
  }
  return tasks.find(
    (task) => task.status === 'dispatched' && task.assignee_handle === member.live_handle
  )
}
