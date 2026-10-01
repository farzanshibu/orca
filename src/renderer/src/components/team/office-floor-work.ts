import { deskTickets, type DeskTicket } from './office-floor-desk-tickets'
import { finishedGoalTasks } from './office-floor-staged-boxes'
import { whiteboardContent, type WhiteboardContent } from './office-floor-whiteboard-goal'
import type { TeamGoal, TeamMember, TeamTask } from './team-snapshot-types'

/** The team's work as the floor shows it, beyond who sits where. */
export type FloorWork = {
  /** What the whiteboard says; null leaves it to its scribbles. */
  board: WhiteboardContent | null
  tickets: readonly DeskTicket[]
  /** Finished tasks of the open goals: boxes in the staging area. */
  finished: number
  /** Things waiting on the human: notes in the reception tray. */
  waiting: number
}

export function floorWork(args: {
  goals: readonly TeamGoal[] | undefined
  tasks: readonly TeamTask[]
  members: readonly Pick<TeamMember, 'is_manager'>[]
  desks: Parameters<typeof deskTickets>[0]
  /** `collectTeamAttention(...).count`, so the floor and the Inbox tab cannot disagree. */
  waiting: number
}): FloorWork {
  const { goals, tasks } = args
  return {
    board: whiteboardContent({
      goals,
      tasks,
      hasManager: args.members.some((member) => member.is_manager)
    }),
    tickets: deskTickets(args.desks),
    finished: finishedGoalTasks(goals, tasks),
    waiting: args.waiting
  }
}
