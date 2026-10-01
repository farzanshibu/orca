import { PAPER_SHEET } from './office-floor-desk-art'
import type { FloorDesk, FloorPoint } from './office-floor-plan'
import { deskPaperSpot } from './office-floor-pods'
import type { TeamMember, TeamTask } from './team-snapshot-types'

/** The ticket on a desk: the ref of the task its member holds. */
export type DeskTicket = { memberId: string; ref: string; at: FloorPoint }

type TicketDesk = {
  desk: FloorDesk
  entry:
    | { member: Pick<TeamMember, 'id' | 'current_task'>; task: Pick<TeamTask, 'ref'> | undefined }
    | undefined
}

/** The centre of the sheet of paper on a desk, where its ticket chip is pinned. */
export function deskTicketSpot(desk: FloorDesk): FloorPoint {
  const paper = deskPaperSpot(desk)
  return { x: paper.x + PAPER_SHEET.w / 2, y: paper.y + PAPER_SHEET.h / 2 }
}

/**
 * A ticket for every desk whose member has a current task. It stays on the desk while the member
 * is away from it, and a task the host gave no ref has nothing readable to show.
 */
export function deskTickets(desks: readonly TicketDesk[]): DeskTicket[] {
  return desks.flatMap(({ desk, entry }) => {
    const ref = entry?.member.current_task?.ref ?? entry?.task?.ref
    return entry && ref ? [{ memberId: entry.member.id, ref, at: deskTicketSpot(desk) }] : []
  })
}
