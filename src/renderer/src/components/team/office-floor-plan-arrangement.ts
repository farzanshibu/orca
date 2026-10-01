import type { FloorRect } from './office-floor-geometry'
import {
  BACK_WALL,
  WALL,
  type FloorDesk,
  type FloorFixtures,
  type FloorPod,
  type FloorPodSlot,
  type FloorRoomId,
  type FloorVariant,
  type OfficeFloorPlan
} from './office-floor-plan-parts'
import { addWall, type PlanDraft } from './office-floor-plan-rooms'

/** Measurements and assembly shared by the side-by-side and the stacked arrangement. */

export const BACK_ROOM_H = 72
export const WAREHOUSE_H = 56
// Bare floor under the last pod row: its lane, and room for the names under the chairs.
export const POD_FOOT = 12

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
  vacantSlots: FloorPodSlot[]
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
