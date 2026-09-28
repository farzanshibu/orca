/** Floor coordinates in SVG units; the floor scales to fit its panel. */
export const FLOOR_WIDTH = 960
const MIN_FLOOR_HEIGHT = 540

export type FloorPoint = { x: number; y: number }

/** Where a member stands, from what it is doing. */
export type FloorActivity = 'working' | 'idle' | 'waiting' | 'off'

export const MANAGER_OFFICE: FloorPoint = { x: 835, y: 170 }
export const OFFICE_BOUNDS = { x: 740, y: 60, width: 190, height: 210 }

const DESK_COLUMNS = 4
const DESK_ORIGIN: FloorPoint = { x: 130, y: 160 }
const DESK_SPACING: FloorPoint = { x: 170, y: 160 }
/** Open desks drawn even when unfilled, so an empty team reads as a floor waiting for hires. */
export const MIN_DESKS = DESK_COLUMNS

export function floorHeight(deskCount: number): number {
  const rows = Math.max(1, Math.ceil(Math.max(deskCount, MIN_DESKS) / DESK_COLUMNS))
  return Math.max(MIN_FLOOR_HEIGHT, DESK_ORIGIN.y + rows * DESK_SPACING.y + 40)
}

/** The break area sits under the manager's office, on the floor's bottom edge. */
export function breakStations(height: number): { cooler: FloorPoint; coffee: FloorPoint } {
  const y = height - 90
  return { cooler: { x: 780, y }, coffee: { x: 870, y } }
}

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

/** Sprite origin is the feet; seated sprites sit behind the desk so it hides their legs. */
const SEAT_OFFSET = -24

/**
 * Idle members stand beside the cooler or coffee, spread so they do not stack; everyone else sits
 * behind their desk (standing beside it while waiting on a prompt).
 */
export function positionFor(
  desk: FloorPoint,
  activity: FloorActivity,
  index: number,
  stations: { cooler: FloorPoint; coffee: FloorPoint }
): FloorPoint {
  if (activity === 'idle') {
    const { cooler, coffee } = stations
    const spots = [
      cooler.x - 45,
      (cooler.x + coffee.x) / 2,
      coffee.x + 45,
      cooler.x - 71,
      coffee.x + 71
    ]
    return { x: spots[index % spots.length], y: cooler.y + 18 }
  }
  if (activity === 'waiting') {
    return { x: desk.x + 66, y: desk.y + 14 }
  }
  return { x: desk.x, y: desk.y + SEAT_OFFSET }
}

/** A stable small integer per member, for picking sprite variants without random flicker. */
export function spriteVariant(seed: string, variants: number): number {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash) % variants
}
