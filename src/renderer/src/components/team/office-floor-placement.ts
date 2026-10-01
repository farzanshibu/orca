import type { FloorPoint, FloorRect } from './office-floor-geometry'

type FloorSize = { width: number; height: number }

function percent(value: number, of: number): string {
  return `${(value / of) * 100}%`
}

/**
 * CSS for an HTML element laid over the floor art. The art scales with its container, so these are
 * percentages of the floor: the element tracks the art at any size without measuring the DOM.
 */
export function rectPlacement(
  floor: FloorSize,
  rect: FloorRect
): { left: string; top: string; width: string; height: string } {
  return {
    left: percent(rect.x, floor.width),
    top: percent(rect.y, floor.height),
    width: percent(rect.w, floor.width),
    height: percent(rect.h, floor.height)
  }
}

export function pointPlacement(floor: FloorSize, point: FloorPoint): { left: string; top: string } {
  return { left: percent(point.x, floor.width), top: percent(point.y, floor.height) }
}

/** A width in art units as a share of the floor's width. */
export function widthPlacement(floor: FloorSize, width: number): string {
  return percent(width, floor.width)
}
