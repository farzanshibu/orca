import type { FloorPlace } from './office-choreography-state'
import { pointOnSegment, samePoint, segmentLength, type FloorPoint } from './office-floor-geometry'
import { floorNavigation, type FloorRoute } from './office-floor-navigation'
import {
  floorAnchor,
  type FloorAnchor,
  type FloorFacing,
  type OfficeFloorPlan
} from './office-floor-plan'
import { seatAnchor, type FloorSeating } from './office-floor-seating'

/** The plan and who sits where on it: what turns a named place into a point on the floor. */
export type FloorStage = { plan: OfficeFloorPlan; seating: FloorSeating }

function anchorOf({ plan, seating }: FloorStage, place: FloorPlace): FloorAnchor | undefined {
  if (place.kind === 'spot') {
    return floorAnchor(plan, place.anchor)
  }
  const seat = seating.seats.get(place.memberId)
  return seat ? floorAnchor(plan, seatAnchor(seat)) : undefined
}

/**
 * Where a character's feet are at `place`, or null when the plan has no such place. Beside a desk
 * is the aisle point the desk is entered from, so a visitor never stands on whoever sits there.
 */
export function placePoint(stage: FloorStage, place: FloorPlace): FloorPoint | null {
  const anchor = anchorOf(stage, place)
  if (!anchor) {
    return null
  }
  return place.kind === 'beside' ? anchor.approach : anchor.point
}

/** How a character holds itself at `place`: in a chair facing some way, or on its feet. */
export function placeStance(
  stage: FloorStage,
  place: FloorPlace
): { seated: boolean; facing: FloorFacing } {
  const anchor = anchorOf(stage, place)
  return {
    seated: place.kind !== 'beside' && Boolean(anchor?.seated),
    facing: anchor?.facing ?? 'viewer'
  }
}

function polylineLength(points: readonly FloorPoint[]): number {
  return points.reduce(
    (total, point, index) =>
      index === 0 ? 0 : total + segmentLength({ from: points[index - 1], to: point }),
    0
  )
}

/** The walk from `cut`, a point somewhere on it, to its end; the whole walk when `cut` is not on it. */
function fromPointOn(points: readonly FloorPoint[], cut: FloorPoint): readonly FloorPoint[] {
  const leg = points.findIndex(
    (point, index) =>
      index + 1 < points.length && pointOnSegment(cut, { from: point, to: points[index + 1] })
  )
  if (leg === -1) {
    return points
  }
  const rest = points.slice(leg + 1)
  return samePoint(rest[0], cut) ? rest : [cut, ...rest]
}

/**
 * The walk between two places along the plan's aisles, or null when either is not on the plan.
 * A walk to or from beside a desk stops short at that desk's aisle point.
 */
export function walkRoute(stage: FloorStage, from: FloorPlace, to: FloorPlace): FloorRoute | null {
  const start = anchorOf(stage, from)
  const end = anchorOf(stage, to)
  const route = start && end ? floorNavigation(stage.plan).routeBetween(start.id, end.id) : null
  if (!start || !end || !route) {
    return null
  }
  let points = route.points
  if (from.kind === 'beside') {
    points = fromPointOn(points, start.approach)
  }
  if (to.kind === 'beside') {
    points = fromPointOn(points.toReversed(), end.approach).toReversed()
  }
  return points === route.points ? route : { points, length: polylineLength(points) }
}
