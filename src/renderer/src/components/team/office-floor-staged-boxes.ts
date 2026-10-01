import type { FloorPoint, FloorRect } from './office-floor-plan'
import { stagingBoxSpots } from './office-floor-warehouse'
import { groupTeamGoalTasks, isTeamGoalClosed } from './team-board-lanes'
import type { TeamGoal, TeamTask } from './team-snapshot-types'

/**
 * Finished tasks of the goals still open: the work waiting in the warehouse to go out. It is the
 * same count each goal's progress shows, and a goal's boxes leave when the goal closes.
 */
export function finishedGoalTasks(
  goals: readonly TeamGoal[] | undefined,
  tasks: readonly TeamTask[]
): number {
  return groupTeamGoalTasks(goals, tasks)
    .goals.filter(({ goal }) => !isTeamGoalClosed(goal))
    .reduce((sum, { goal }) => sum + goal.progress.done, 0)
}

export type StagedBoxes = {
  /** Top-left corner of each box drawn, floor layer first. */
  spots: readonly FloorPoint[]
  /** The whole count, set only when there are more finished tasks than boxes drawn. */
  overflowCount: number | null
}

/** One box per finished task until the staging area is full; past that the count is written out. */
export function stagedBoxes(staging: FloorRect, finished: number): StagedBoxes {
  const spots = stagingBoxSpots(staging).slice(0, Math.max(0, finished))
  return { spots, overflowCount: finished > spots.length ? finished : null }
}
