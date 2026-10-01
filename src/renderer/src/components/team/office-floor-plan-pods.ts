import type { FloorPoint } from './office-floor-geometry'
import {
  AISLE,
  DESK_W,
  POD,
  POD_BLOCK,
  POD_DESK_COLUMNS,
  POD_LANE_GAP,
  POD_SEATS,
  SEAT_DROP,
  seatAnchorId,
  type FloorDesk,
  type FloorPod,
  type FloorRoomId
} from './office-floor-plan-parts'
import { laneAcross, type PlanDraft } from './office-floor-plan-rooms'

export const POD_ROW_PITCH = POD.h + AISLE
export const POD_COLUMN_PITCH = POD.w + AISLE
// From a pod's top edge to the bottom of the name over a viewer-facing seat.
const NAME_OVER_HEAD = 5
// From an away-facing seat to the name under its chair.
const NAME_UNDER_CHAIR = 6

export function podRows(podCount: number, columns: number): number {
  return Math.max(1, Math.ceil(podCount / columns))
}

export function podRowsHeight(rows: number): number {
  return rows * POD_ROW_PITCH - AISLE
}

/** The lane above pod row `row`; row `rows` is the lane under the last one. */
export function podRowLaneY(podsTop: number, row: number): number {
  return podsTop + row * POD_ROW_PITCH - POD_LANE_GAP
}

/** One lane above each pod row and one under the last: a row is entered from both sides. */
export function addPodRowLanes(
  draft: PlanDraft,
  podsTop: number,
  rows: number,
  x1: number,
  x2: number
): void {
  for (let row = 0; row <= rows; row += 1) {
    laneAcross(draft, podRowLaneY(podsTop, row), x1, x2)
  }
}

/**
 * One pod of facing desks with its top-left corner at `origin`. The first row sits behind the
 * shared desk block and faces the viewer; the second sits in front of it, facing away.
 */
export function addPod(
  draft: PlanDraft,
  index: number,
  room: FloorRoomId,
  origin: FloorPoint
): FloorPod {
  const middle = origin.y + POD_BLOCK.middle
  const desks = Array.from({ length: POD_SEATS }, (_, desk): FloorDesk => {
    const viewer = desk < POD_DESK_COLUMNS
    const x = origin.x + (desk % POD_DESK_COLUMNS) * DESK_W
    const seat = {
      x: x + DESK_W / 2,
      y: origin.y + (viewer ? POD_BLOCK.top : POD_BLOCK.bottom + SEAT_DROP)
    }
    const anchor = seatAnchorId(index, desk)
    const facing = viewer ? 'viewer' : 'away'
    draft.anchors.push({
      id: anchor,
      room,
      point: seat,
      approach: {
        x: seat.x,
        y: viewer ? origin.y - POD_LANE_GAP : origin.y + POD.h + POD_LANE_GAP
      },
      seated: true,
      facing
    })
    return viewer
      ? {
          anchor,
          facing,
          seat,
          cell: { x, y: origin.y, w: DESK_W, h: POD_BLOCK.middle },
          top: { x, y: seat.y, w: DESK_W, h: POD_BLOCK.middle - POD_BLOCK.top },
          nameplate: { at: { x: seat.x, y: origin.y + NAME_OVER_HEAD }, above: true }
        }
      : {
          anchor,
          facing,
          seat,
          cell: { x, y: middle, w: DESK_W, h: POD.h - POD_BLOCK.middle },
          top: { x, y: middle, w: DESK_W, h: POD_BLOCK.bottom - POD_BLOCK.middle },
          nameplate: { at: { x: seat.x, y: seat.y + NAME_UNDER_CHAIR }, above: false }
        }
  })
  return { index, room, rect: { ...origin, ...POD }, desks }
}
