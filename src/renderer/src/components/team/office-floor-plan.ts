/**
 * The office floor plan, in art units (one unit = one art pixel). Rooms, walls, doors, desks,
 * anchors and aisles all come from here, so nothing on the floor is measured from the DOM.
 */
import { sideBySidePlan } from './office-floor-plan-side-by-side'
import { stackedPlan } from './office-floor-plan-stacked'
import type {
  FloorAnchor,
  FloorAnchorId,
  FloorRoom,
  FloorRoomId,
  FloorVariant,
  OfficeFloorPlan
} from './office-floor-plan-parts'

export type { FloorPoint, FloorRect, FloorSegment } from './office-floor-geometry'
export {
  BACK_WALL,
  DESK_CELL,
  POD_SEATS,
  WALL,
  conferenceAnchorId,
  kitchenAnchorId,
  seatAnchorId
} from './office-floor-plan-parts'
export type {
  FloorAnchor,
  FloorAnchorId,
  FloorDesk,
  FloorDoor,
  FloorFixtures,
  FloorPod,
  FloorRoom,
  FloorRoomId,
  FloorVariant,
  FloorWall,
  OfficeFloorPlan
} from './office-floor-plan-parts'

/** Container widths, in CSS pixels, where the arrangement changes. */
export const FLOOR_NARROW_BELOW = 640
export const FLOOR_WIDE_ABOVE = 1120
/** A boundary only gives way once the width is this far past it, so a resize near it cannot flap. */
export const FLOOR_VARIANT_HYSTERESIS = 40

/** The arrangement for a container width. `previous` is what is on screen now, if anything. */
export function floorVariant(containerWidth: number, previous: FloorVariant | null): FloorVariant {
  if (previous === null) {
    if (containerWidth < FLOOR_NARROW_BELOW) {
      return 'narrow'
    }
    return containerWidth > FLOOR_WIDE_ABOVE ? 'wide' : 'medium'
  }
  const narrowBelow =
    FLOOR_NARROW_BELOW + (previous === 'narrow' ? 1 : -1) * FLOOR_VARIANT_HYSTERESIS
  const wideAbove = FLOOR_WIDE_ABOVE + (previous === 'wide' ? -1 : 1) * FLOOR_VARIANT_HYSTERESIS
  if (containerWidth < narrowBelow) {
    return 'narrow'
  }
  return containerWidth > wideAbove ? 'wide' : 'medium'
}

const plans = new Map<string, OfficeFloorPlan>()

/**
 * The plan for `podCount` pods (at least one). Pod `n` is in the same place in every plan of a
 * variant that has it, so the result is cached and shared: callers must not mutate it.
 */
export function officeFloorPlan(variant: FloorVariant, podCount: number): OfficeFloorPlan {
  const pods = Math.max(1, Math.floor(podCount))
  const key = `${variant}:${pods}`
  let plan = plans.get(key)
  if (!plan) {
    plan = variant === 'narrow' ? stackedPlan(pods) : sideBySidePlan(variant, pods)
    plans.set(key, plan)
  }
  return plan
}

export function floorRoom(plan: OfficeFloorPlan, id: FloorRoomId): FloorRoom | undefined {
  return plan.rooms.find((room) => room.id === id)
}

export function floorAnchor(plan: OfficeFloorPlan, id: FloorAnchorId): FloorAnchor | undefined {
  return plan.anchors.find((anchor) => anchor.id === id)
}
