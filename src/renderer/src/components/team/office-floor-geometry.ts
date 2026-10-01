/** Floor geometry in art units (one unit = one art pixel). Everything here is axis-aligned. */

export type FloorPoint = { x: number; y: number }
export type FloorRect = { x: number; y: number; w: number; h: number }
/** A straight horizontal or vertical run between two points. */
export type FloorSegment = { from: FloorPoint; to: FloorPoint }

export function samePoint(a: FloorPoint, b: FloorPoint): boolean {
  return a.x === b.x && a.y === b.y
}

export function segmentLength({ from, to }: FloorSegment): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
}

/** Rectangles that merely share an edge do not overlap. */
export function rectsOverlap(a: FloorRect, b: FloorRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function rectContainsRect(outer: FloorRect, inner: FloorRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

/** Edges count as inside, so a spot against a wall still belongs to its room. */
export function rectContainsPoint(rect: FloorRect, point: FloorPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  )
}

export function pointOnSegment(point: FloorPoint, { from, to }: FloorSegment): boolean {
  return (
    point.x >= Math.min(from.x, to.x) &&
    point.x <= Math.max(from.x, to.x) &&
    point.y >= Math.min(from.y, to.y) &&
    point.y <= Math.max(from.y, to.y)
  )
}

/** Whether a run passes through a rectangle's interior; sliding along its edge does not count. */
export function segmentCrossesRect({ from, to }: FloorSegment, rect: FloorRect): boolean {
  return (
    Math.min(from.x, to.x) < rect.x + rect.w &&
    Math.max(from.x, to.x) > rect.x &&
    Math.min(from.y, to.y) < rect.y + rect.h &&
    Math.max(from.y, to.y) > rect.y
  )
}
