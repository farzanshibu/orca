import type { FloorPoint, FloorRect, FloorSegment } from './office-floor-geometry'

/** Which arrangement of rooms the container is wide enough for. */
export type FloorVariant = 'narrow' | 'medium' | 'wide'

export type FloorRoomId =
  | 'manager'
  | 'conference'
  | 'kitchen'
  | 'reception'
  | 'bullpen'
  | 'annex'
  | 'warehouse'

/**
 * A named place a character can be sent to. `seat:<pod>:<desk>` is a staff desk, `conference:<n>`
 * a chair at the meeting table and `kitchen:<n>` a spot at the counter; the rest are one of a kind.
 */
export type FloorAnchorId =
  | 'manager'
  | 'whiteboard'
  | 'reception'
  | 'entrance'
  | 'dock'
  | `seat:${number}:${number}`
  | `conference:${number}`
  | `kitchen:${number}`

export function seatAnchorId(pod: number, desk: number): FloorAnchorId {
  return `seat:${pod}:${desk}`
}

export function conferenceAnchorId(chair: number): FloorAnchorId {
  return `conference:${chair}`
}

export function kitchenAnchorId(spot: number): FloorAnchorId {
  return `kitchen:${spot}`
}

export type FloorAnchor = {
  id: FloorAnchorId
  room: FloorRoomId
  /** Where a character's feet rest. */
  point: FloorPoint
  /** The aisle point this anchor is entered from; the same as `point` for a spot on an aisle. */
  approach: FloorPoint
  /** A chair, not a place to stand. */
  seated: boolean
}

/** An opening in a wall between two rooms. */
export type FloorDoor = {
  id: string
  rooms: readonly [FloorRoomId, FloorRoomId]
  rect: FloorRect
}

/** `shell` is the building's outer wall; `glass` is a partition you can see through. */
export type FloorWall = { rect: FloorRect; kind: 'shell' | 'partition' | 'glass' }

export type FloorRoom = { id: FloorRoomId; rect: FloorRect; doors: readonly FloorDoor[] }

export type FloorDesk = {
  anchor: FloorAnchorId
  /** The desk, monitor and chair are drawn relative to this cell. */
  cell: FloorRect
  /** Where the seated character's feet rest. */
  seat: FloorPoint
}

/** A block of desks that seats one role. */
export type FloorPod = {
  index: number
  room: FloorRoomId
  rect: FloorRect
  desks: readonly FloorDesk[]
}

/** Things drawn in a room that later milestones attach content to. */
export type FloorFixtures = {
  whiteboard: FloorRect
  conferenceTable: FloorRect
  kitchenCounter: FloorRect
  receptionDesk: FloorRect
  /** The front panel of the reception desk; it carries the team name. */
  sign: FloorRect
  entrance: FloorRect
  /** Where finished work is stacked. */
  shelf: FloorRect
  dock: FloorRect
}

export type OfficeFloorPlan = {
  variant: FloorVariant
  width: number
  height: number
  /** How many pods share a row; a pod's slot never moves, further pods add rows below. */
  podColumns: number
  rooms: readonly FloorRoom[]
  /** Solid wall pieces; door openings are already cut out of them. */
  walls: readonly FloorWall[]
  doors: readonly FloorDoor[]
  pods: readonly FloorPod[]
  managerDesk: FloorDesk
  fixtures: FloorFixtures
  anchors: readonly FloorAnchor[]
  /** Where characters may walk: door crossings and the lanes between furniture. */
  aisles: readonly FloorSegment[]
}

/** Outer wall thickness. */
export const WALL = 8
/** Where the floor starts under the back wall; the wall's face is tall enough to hang a whiteboard. */
export const BACK_WALL = 44
/** Thickness of a wall between rooms. */
export const PARTITION = 4
/** Width of a door opening, and of the lane between pods. */
export const AISLE = 16
export const DESK_CELL = { w: 64, h: 76 }
export const POD_DESK_COLUMNS = 2
export const POD_SEATS = 4
export const POD = {
  w: POD_DESK_COLUMNS * DESK_CELL.w,
  h: (POD_SEATS / POD_DESK_COLUMNS) * DESK_CELL.h
}
/** From a desk cell's top to the lane a seated character walks out along. */
export const DESK_LANE_OFFSET = 66
/** From a desk cell's top to where the seated character's feet rest. */
export const DESK_SEAT_OFFSET = 50
