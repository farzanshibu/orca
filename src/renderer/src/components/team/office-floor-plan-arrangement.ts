import type { FloorRect } from './office-floor-geometry'
import {
  AISLE,
  BACK_WALL,
  DESK_CELL,
  DESK_LANE_OFFSET,
  POD,
  WALL,
  type FloorDesk,
  type FloorFixtures,
  type FloorPod,
  type FloorRoomId,
  type FloorVariant,
  type OfficeFloorPlan
} from './office-floor-plan-parts'
import { addWall, type PlanDraft } from './office-floor-plan-rooms'

/** Measurements and assembly shared by the side-by-side and the stacked arrangement. */

export const BACK_ROOM_H = 72
export const WAREHOUSE_H = 48
// The strip of bullpen above the first pod row that the hall lane runs along.
export const HALL_H = 16
export const HALL_LANE_INSET = 10
// Bare floor between a pod and the wall above or below it.
export const POD_MARGIN = 4
export const POD_ROW_PITCH = POD.h + AISLE
export const POD_COLUMN_PITCH = POD.w + AISLE

export function podRows(podCount: number, columns: number): number {
  return Math.max(1, Math.ceil(podCount / columns))
}

export function podRowsHeight(rows: number): number {
  return rows * POD_ROW_PITCH - AISLE
}

/** The lane behind the last desk row; aisles that lead nowhere further stop here. */
export function lowestDeskLaneY(podsTop: number, rows: number): number {
  return podsTop + (rows - 1) * POD_ROW_PITCH + POD.h - DESK_CELL.h + DESK_LANE_OFFSET
}

export function room(draft: PlanDraft, id: FloorRoomId, rect: FloorRect): FloorRect {
  draft.rooms.push({ id, rect })
  return rect
}

type PlanFrame = {
  variant: FloorVariant
  width: number
  height: number
  podColumns: number
  pods: FloorPod[]
  managerDesk: FloorDesk
  fixtures: FloorFixtures
}

export function finishPlan(draft: PlanDraft, frame: PlanFrame): OfficeFloorPlan {
  const { width, height } = frame
  addWall(draft, { x: 0, y: 0, w: width, h: BACK_WALL }, 'shell')
  addWall(draft, { x: 0, y: height - WALL, w: width, h: WALL }, 'shell')
  addWall(draft, { x: 0, y: 0, w: WALL, h: height }, 'shell')
  addWall(draft, { x: width - WALL, y: 0, w: WALL, h: height }, 'shell')
  return {
    ...frame,
    rooms: draft.rooms.map(({ id, rect }) => ({
      id,
      rect,
      doors: draft.doors.filter((door) => door.rooms.includes(id))
    })),
    walls: draft.walls,
    doors: draft.doors,
    anchors: draft.anchors,
    aisles: draft.aisles
  }
}
