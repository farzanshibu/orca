import type { TeamGoal, TeamTask } from './team-snapshot-types'

// Done cards, and a closed goal with everything under it, leave the board once this old.
const SETTLED_TTL_MS = 30 * 60_000

export type TeamBoardColumn = 'todo' | 'doing' | 'blocked' | 'done'

export const TEAM_BOARD_COLUMNS: readonly TeamBoardColumn[] = ['todo', 'doing', 'blocked', 'done']

export function teamBoardColumn(status: string): TeamBoardColumn {
  if (status === 'dispatched') {
    return 'doing'
  }
  if (status === 'blocked' || status === 'failed') {
    return 'blocked'
  }
  return status === 'completed' ? 'done' : 'todo'
}

/** A host timestamp: SQLite's `datetime('now')`, which is UTC with no zone marker, or an ISO string. */
export function parseSqliteUtc(value: string | null): number | null {
  if (!value) {
    return null
  }
  const iso = value.replace(' ', 'T')
  const parsed = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`)
  return Number.isFinite(parsed) ? parsed : null
}

export function visibleTeamTasks(tasks: readonly TeamTask[], now: number): TeamTask[] {
  return tasks.filter((task) => {
    if (task.status !== 'completed') {
      return true
    }
    const completed = parseSqliteUtc(task.completed_at)
    return completed === null || now - completed < SETTLED_TTL_MS
  })
}

export type TeamBoardGoal = {
  id: string
  ref: string | null
  title: string
  /** `open`, `completed` or `cancelled`; a newer host's value is kept as it came. */
  status: string
  progress: { done: number; total: number }
  /** The manager was asked to review and has not closed the goal yet. */
  reviewRequested: boolean
}

/** A goal with the cards under it, or with `goal: null` the tasks that belong to no goal. */
export type TeamBoardLane = { goal: TeamBoardGoal | null; cards: TeamTask[] }

export function isTeamGoalClosed(goal: Pick<TeamBoardGoal, 'status'>): boolean {
  return goal.status === 'completed' || goal.status === 'cancelled'
}

function isSettled(task: Pick<TeamTask, 'status'>): boolean {
  return task.status === 'completed' || task.status === 'failed'
}

function countProgress(children: readonly TeamTask[]): { done: number; total: number } {
  return {
    done: children.filter((task) => task.status === 'completed').length,
    total: children.length
  }
}

function listedGoal(goal: TeamGoal, children: readonly TeamTask[]): TeamBoardGoal {
  return {
    id: goal.id,
    ref: goal.ref,
    title: goal.title,
    status: goal.status,
    progress: goal.progress ?? countProgress(children),
    reviewRequested: Boolean(goal.review_requested_at)
  }
}

/** A task's title, or the first line of its spec when it was filed without one. */
export function teamTaskHeadline(task: Pick<TeamTask, 'task_title' | 'spec'>): string {
  return task.task_title?.trim() || (task.spec.trim().split('\n')[0] ?? '')
}

/** A goal the host left out of `goals`, rebuilt from its task row so its tasks keep their heading. */
function unlistedGoal(row: TeamTask, children: readonly TeamTask[]): TeamBoardGoal {
  return {
    id: row.id,
    ref: row.ref,
    title: teamTaskHeadline(row),
    status:
      row.status === 'completed' ? 'completed' : row.status === 'failed' ? 'cancelled' : 'open',
    progress: countProgress(children),
    reviewRequested: false
  }
}

/** A closed goal stays while a task of it still runs, and otherwise for a while after it closed. */
function isLaneShown(
  goal: TeamBoardGoal,
  row: TeamTask | undefined,
  children: readonly TeamTask[],
  now: number
): boolean {
  if (!isTeamGoalClosed(goal) || children.some((task) => !isSettled(task))) {
    return true
  }
  const closedAt = parseSqliteUtc(row?.completed_at ?? null)
  return closedAt !== null && now - closedAt < SETTLED_TTL_MS
}

/** A goal with its own task row, when the snapshot has one, and every task filed under it. */
export type TeamGoalTasks = {
  goal: TeamBoardGoal
  row: TeamTask | undefined
  tasks: readonly TeamTask[]
}

/**
 * Every goal the page knows of, in the host's order (oldest first), each with all of its tasks
 * however long ago they finished, and the tasks under no goal. A goal's own task row is never one
 * of its tasks. A task whose parent is not a goal the page knows of counts as under no goal.
 */
export function groupTeamGoalTasks(
  listedGoals: readonly TeamGoal[] | undefined,
  tasks: readonly TeamTask[]
): { goals: TeamGoalTasks[]; loose: TeamTask[] } {
  const listed = listedGoals ?? []
  const rows = new Map(tasks.map((task) => [task.id, task]))
  const goalIds = new Set([
    ...listed.map((goal) => goal.id),
    ...tasks.filter((task) => task.kind === 'goal').map((task) => task.id)
  ])
  const children = new Map<string, TeamTask[]>()
  const loose: TeamTask[] = []
  for (const task of tasks) {
    if (goalIds.has(task.id)) {
      continue
    }
    if (task.parent_id && goalIds.has(task.parent_id)) {
      children.set(task.parent_id, [...(children.get(task.parent_id) ?? []), task])
    } else {
      loose.push(task)
    }
  }
  const listedIds = new Set(listed.map((goal) => goal.id))
  const goals = [
    ...listed.map((goal) => listedGoal(goal, children.get(goal.id) ?? [])),
    ...tasks
      .filter((task) => task.kind === 'goal' && !listedIds.has(task.id))
      .map((row) => unlistedGoal(row, children.get(row.id) ?? []))
  ]
  return {
    goals: goals.map((goal) => ({
      goal,
      row: rows.get(goal.id),
      tasks: children.get(goal.id) ?? []
    })),
    loose
  }
}

/**
 * The board as lanes: open goals, then goals closed a moment ago, then tasks under no goal. A goal's
 * own task row is its heading, never a card. A task whose parent is not a goal the page knows of
 * stays on the board as a task with no goal rather than being dropped.
 */
export function groupTeamBoard(args: {
  goals: readonly TeamGoal[] | undefined
  tasks: readonly TeamTask[]
  now: number
}): TeamBoardLane[] {
  const { now } = args
  const { goals, loose } = groupTeamGoalTasks(args.goals, args.tasks)
  const lanes = goals
    .filter(({ goal, row, tasks }) => isLaneShown(goal, row, tasks, now))
    .map(({ goal, tasks }) => ({ goal, cards: visibleTeamTasks(tasks, now) }))
  const looseCards = visibleTeamTasks(loose, now)
  return [
    ...lanes.filter((lane) => !isTeamGoalClosed(lane.goal)),
    ...lanes.filter((lane) => isTeamGoalClosed(lane.goal)),
    ...(looseCards.length > 0 ? [{ goal: null, cards: looseCards }] : [])
  ]
}

export type TeamGoalAction = 'close' | 'cancel'

/**
 * What the board offers on a goal. Close marks it completed, so it is offered only once every task
 * under it is done; until then, and for a goal with no tasks yet, the honest action is Cancel.
 */
export function teamGoalAction(
  goal: Pick<TeamBoardGoal, 'status' | 'progress'>
): TeamGoalAction | null {
  if (goal.status !== 'open') {
    return null
  }
  const { done, total } = goal.progress
  return total > 0 && done >= total ? 'close' : 'cancel'
}
