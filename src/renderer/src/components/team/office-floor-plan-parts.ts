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

/** Which way a character looks: at the viewer, showing a face, or away, showing a back. */
export type FloorFacing = 'viewer' | 'away'

export type FloorAnchor = {
  id: FloorAnchorId
  room: FloorRoomId
  /** Where a character's feet rest. */
  point: FloorPoint
  /** The aisle point this anchor is entered from; the same as `point` for a spot on an aisle. */
  approach: FloorPoint
  /** A chair, not a place to stand. */
  seated: boolean
  facing: FloorFacing
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
  /** The desk's share of the floor, chair included; it is the desk's click target. */
  cell: FloorRect
  /** Where the seated character's feet rest: against the desk's edge, on the side they sit. */
  seat: FloorPoint
  /** `viewer` sits behind the desk, `away` in front of it. */
  facing: FloorFacing
  /** The desk itself, front panel included. Nobody walks through it. */
  top: FloorRect
  /** Where the occupant's name goes; the label grows upward from `at` when `above`. */
  nameplate: { at: FloorPoint; above: boolean }
}

/** A block of desks that seats one role. */
export type FloorPod = {
  index: number
  room: FloorRoomId
  rect: FloorRect
  desks: readonly FloorDesk[]
}

/** A reserved pod place that no pod has taken yet. */
export type FloorPodSlot = { room: FloorRoomId; rect: FloorRect }

/** Things drawn in a room that later milestones attach content to. */
export type FloorFixtures = {
  whiteboard: FloorRect
  conferenceTable: FloorRect
  kitchenCounter: FloorRect
  receptionDesk: FloorRect
  /** The front panel of the reception desk; it carries the team name. */
  sign: FloorRect
  /** The tray on the reception desk where notes for the human pile up. */
  noteTray: FloorRect
  entrance: FloorRect
  /** Storage racks along the warehouse's back wall. */
  shelf: FloorRect
  /** Marked, empty floor beside the dock; finished work is stacked here. */
  staging: FloorRect
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
  /** Reserved pod places still empty; the room dresses them until a pod moves in. */
  vacantSlots: readonly FloorPodSlot[]
  managerDesk: FloorDesk
  fixtures: FloorFixtures
  anchors: readonly FloorAnchor[]
  /** Where characters may walk: door crossings and the lanes between furniture. */
  aisles: readonly FloorSegment[]
}

/** Outer wall thickness. */
export const WALL = 8
/** Where the floor starts under the back wall; the wall's face is tall enough to hang a whiteboard. */
export const BACK_WALL = 48
/** Thickness of a wall between rooms. */
export const PARTITION = 4
/** Width of a door opening, and of the lane between pods. */
export const AISLE = 16
/** One desk's share of a pod's width. */
export const DESK_W = 56
export const POD_DESK_COLUMNS = 2
export const POD_SEATS = 4
export const POD = { w: POD_DESK_COLUMNS * DESK_W, h: 100 }
/**
 * A pod from its top edge down: the row that faces the viewer, the desk block the two rows share,
 * then the row that faces away. Each seat is against the block's edge.
 */
export const POD_BLOCK = { top: 24, middle: 41, bottom: 62 }
/** From the block's bottom edge to the feet of whoever sits in front of it. */
export const SEAT_DROP = 22
/** A pod's rows are entered from a lane this far above and below the pod. */
export const POD_LANE_GAP = AISLE / 2
