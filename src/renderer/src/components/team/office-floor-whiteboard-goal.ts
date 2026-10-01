import { groupTeamGoalTasks, isTeamGoalClosed, teamTaskHeadline } from './team-board-lanes'
import type { TeamGoal, TeamTask } from './team-snapshot-types'

export type WhiteboardSubtask = { id: string; ref: string | null; title: string; done: boolean }

export type WhiteboardGoal = {
  kind: 'goal'
  id: string
  title: string
  progress: { done: number; total: number }
  /** Every task under the goal, in the order the manager filed them. */
  subtasks: readonly WhiteboardSubtask[]
  /** Open goals besides this one. */
  otherGoals: number
}

/** What is written on the whiteboard: the goal in play, or an invitation to set one. */
export type WhiteboardContent = WhiteboardGoal | { kind: 'empty' }

/** One line of the board's 11px type, in CSS pixels. */
export const WHITEBOARD_LINE_PX = 14

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * The newest open goal with its tasks. Null leaves the board to its scribbles: a host that sends no
 * goals has none to show, and a team with no manager has nobody to give one to.
 */
export function whiteboardContent(args: {
  goals: readonly TeamGoal[] | undefined
  tasks: readonly TeamTask[]
  hasManager: boolean
}): WhiteboardContent | null {
  const open = groupTeamGoalTasks(args.goals, args.tasks).goals.filter(
    ({ goal }) => !isTeamGoalClosed(goal)
  )
  // The host lists goals oldest first.
  const current = open.at(-1)
  if (!current) {
    return args.goals === undefined || !args.hasManager ? null : { kind: 'empty' }
  }
  return {
    kind: 'goal',
    id: current.goal.id,
    title: oneLine(current.goal.title),
    progress: current.goal.progress,
    subtasks: current.tasks.map((task) => ({
      id: task.id,
      ref: task.ref,
      title: oneLine(teamTaskHeadline(task)),
      done: task.status === 'completed'
    })),
    otherGoals: open.length - 1
  }
}

/** How many lines of type fit a board whose writable area is `heightPx` tall; never fewer than one. */
export function whiteboardLineBudget(heightPx: number): number {
  return Math.max(1, Math.floor(heightPx / WHITEBOARD_LINE_PX))
}

export type WhiteboardLine =
  | { kind: 'heading'; title: string; progress: { done: number; total: number } }
  | { kind: 'subtask'; subtask: WhiteboardSubtask }
  /** What did not fit: tasks of this goal, and other open goals. */
  | { kind: 'more'; subtasks: number; goals: number }

/**
 * The goal as at most `budget` lines, so nothing is ever clipped: the heading, then the tasks, then
 * one line counting what was left out. When the tasks do not all fit, unfinished ones are kept
 * ahead of finished ones, and the ones kept stay in their filed order.
 */
export function whiteboardLines(goal: WhiteboardGoal, budget: number): WhiteboardLine[] {
  const heading: WhiteboardLine = { kind: 'heading', title: goal.title, progress: goal.progress }
  const room = Math.max(0, Math.floor(budget) - 1)
  if (room === 0) {
    return [heading]
  }
  const { subtasks, otherGoals } = goal
  if (subtasks.length + (otherGoals > 0 ? 1 : 0) <= room) {
    return [
      heading,
      ...subtasks.map((subtask): WhiteboardLine => ({ kind: 'subtask', subtask })),
      ...(otherGoals > 0 ? [{ kind: 'more' as const, subtasks: 0, goals: otherGoals }] : [])
    ]
  }
  const kept = new Set(
    [...subtasks.filter(({ done }) => !done), ...subtasks.filter(({ done }) => done)]
      .slice(0, room - 1)
      .map(({ id }) => id)
  )
  return [
    heading,
    ...subtasks
      .filter(({ id }) => kept.has(id))
      .map((subtask): WhiteboardLine => ({ kind: 'subtask', subtask })),
    { kind: 'more', subtasks: subtasks.length - kept.size, goals: otherGoals }
  ]
}
