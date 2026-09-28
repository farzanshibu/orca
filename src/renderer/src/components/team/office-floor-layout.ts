/** Floor coordinates in SVG units; the floor scales to fit its panel. */
export const FLOOR_WIDTH = 960
export const FLOOR_HEIGHT = 540

export type FloorPoint = { x: number; y: number }

/** Where a member stands, from what it is doing. */
export type FloorActivity = 'working' | 'idle' | 'waiting' | 'off'

export const MANAGER_OFFICE: FloorPoint = { x: 820, y: 120 }
export const WATER_COOLER: FloorPoint = { x: 140, y: 460 }
export const COFFEE_STATION: FloorPoint = { x: 260, y: 470 }

const DESK_COLUMNS = 4
const DESK_ORIGIN: FloorPoint = { x: 140, y: 120 }
const DESK_SPACING: FloorPoint = { x: 150, y: 130 }

/** Desks fill left to right, top to bottom; the manager keeps the corner office. */
export function deskFor(index: number, isManager: boolean): FloorPoint {
  if (isManager) {
    return MANAGER_OFFICE
  }
  return {
    x: DESK_ORIGIN.x + (index % DESK_COLUMNS) * DESK_SPACING.x,
    y: DESK_ORIGIN.y + Math.floor(index / DESK_COLUMNS) * DESK_SPACING.y
  }
}

export function floorActivity(
  liveness: string,
  agentStatus: string | null,
  paused: boolean
): FloorActivity {
  if (liveness !== 'live' || paused) {
    return 'off'
  }
  if (agentStatus === 'working') {
    return 'working'
  }
  if (agentStatus === 'permission' || agentStatus === 'blocked') {
    return 'waiting'
  }
  return 'idle'
}

/**
 * Idle members wander to the cooler or coffee, spread so they do not stack; everyone else sits at
 * their desk (standing beside it while waiting on a prompt).
 */
export function positionFor(desk: FloorPoint, activity: FloorActivity, index: number): FloorPoint {
  if (activity === 'idle') {
    const spot = index % 2 === 0 ? WATER_COOLER : COFFEE_STATION
    return { x: spot.x + ((index * 23) % 60) - 30, y: spot.y - 30 - ((index * 17) % 30) }
  }
  if (activity === 'waiting') {
    return { x: desk.x + 34, y: desk.y + 6 }
  }
  return { x: desk.x, y: desk.y + 22 }
}

/** A stable small integer per member, for picking sprite variants without random flicker. */
export function spriteVariant(seed: string, variants: number): number {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash) % variants
}
