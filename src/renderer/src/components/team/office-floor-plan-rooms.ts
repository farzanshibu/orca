import type { FloorPoint, FloorRect, FloorSegment } from './office-floor-geometry'
import {
  AISLE,
  BACK_WALL,
  DESK_CELL,
  DESK_LANE_OFFSET,
  DESK_SEAT_OFFSET,
  PARTITION,
  POD,
  POD_DESK_COLUMNS,
  POD_SEATS,
  WALL,
  conferenceAnchorId,
  kitchenAnchorId,
  seatAnchorId,
  type FloorAnchor,
  type FloorDesk,
  type FloorDoor,
  type FloorPod,
  type FloorRoomId,
  type FloorWall
} from './office-floor-plan-parts'

/** What an arrangement collects while it places rooms; the finished plan is assembled from it. */
export type PlanDraft = {
  rooms: { id: FloorRoomId; rect: FloorRect }[]
  walls: FloorWall[]
  doors: FloorDoor[]
  anchors: FloorAnchor[]
  aisles: FloorSegment[]
}

export function emptyDraft(): PlanDraft {
  return { rooms: [], walls: [], doors: [], anchors: [], aisles: [] }
}

// A room's own lane runs this far above its bottom wall, clear of the furniture along its back.
const LANE_INSET = 6
const CONFERENCE_TABLE = { w: 100, h: 16 }
const CONFERENCE_CHAIRS_PER_SIDE = 4
const CONFERENCE_CHAIR_PITCH = 24
const KITCHEN_SPOTS = 3

export function laneAcross(draft: PlanDraft, y: number, x1: number, x2: number): void {
  draft.aisles.push({ from: { x: Math.min(x1, x2), y }, to: { x: Math.max(x1, x2), y } })
}

export function laneDown(draft: PlanDraft, x: number, y1: number, y2: number): void {
  draft.aisles.push({ from: { x, y: Math.min(y1, y2) }, to: { x, y: Math.max(y1, y2) } })
}

/** A door in a horizontal wall whose top edge is `y`, centred on `x`. */
export function doorAcross(
  id: string,
  rooms: readonly [FloorRoomId, FloorRoomId],
  x: number,
  y: number
): FloorDoor {
  return { id, rooms, rect: { x: x - AISLE / 2, y, w: AISLE, h: PARTITION } }
}

/** A door in a vertical wall whose left edge is `x`, opening downward from `y`. */
export function doorDown(
  id: string,
  rooms: readonly [FloorRoomId, FloorRoomId],
  x: number,
  y: number
): FloorDoor {
  return { id, rooms, rect: { x, y, w: PARTITION, h: AISLE } }
}

/** Adds a straight wall, cut open at each of `doors`, and records those doors. */
export function addWall(
  draft: PlanDraft,
  run: FloorRect,
  kind: FloorWall['kind'],
  doors: readonly FloorDoor[] = []
): void {
  const across = run.w >= run.h
  const end = across ? run.x + run.w : run.y + run.h
  let cursor = across ? run.x : run.y
  const piece = (from: number, to: number): void => {
    if (to > from) {
      draft.walls.push({
        kind,
        rect: across
          ? { x: from, y: run.y, w: to - from, h: run.h }
          : { x: run.x, y: from, w: run.w, h: to - from }
      })
    }
  }
  const ordered = [...doors].sort((a, b) => (across ? a.rect.x - b.rect.x : a.rect.y - b.rect.y))
  for (const door of ordered) {
    const start = across ? door.rect.x : door.rect.y
    piece(cursor, start)
    cursor = start + (across ? door.rect.w : door.rect.h)
    draft.doors.push(door)
  }
  piece(cursor, end)
}

/** The manager's desk, and the lane from it to the door in the office's bottom wall. */
export function furnishManagerOffice(
  draft: PlanDraft,
  room: FloorRect,
  exitY: number
): { desk: FloorDesk; doorX: number } {
  const cell = {
    x: room.x + (room.w - DESK_CELL.w) / 2,
    y: room.y + 2,
    w: DESK_CELL.w,
    h: room.h - 4
  }
  const seat = { x: cell.x + DESK_CELL.w / 2, y: cell.y + DESK_SEAT_OFFSET }
  const laneY = room.y + room.h - LANE_INSET
  const doorX = room.x + room.w - AISLE
  laneAcross(draft, laneY, seat.x, doorX)
  laneDown(draft, doorX, laneY, exitY)
  draft.anchors.push({
    id: 'manager',
    room: 'manager',
    point: seat,
    approach: { x: seat.x, y: laneY },
    seated: true
  })
  return { desk: { anchor: 'manager', cell, seat }, doorX }
}

/**
 * The meeting table with a chair row on each long side, and the whiteboard on the back wall above
 * it. The lane to the door runs down the side the door is on, clear of the table.
 */
export function furnishConference(
  draft: PlanDraft,
  room: FloorRect,
  exit: { side: 'left' | 'right'; y: number }
): { table: FloorRect; whiteboard: FloorRect; doorX: number } {
  const doorOnLeft = exit.side === 'left'
  const doorX = doorOnLeft ? room.x + 12 : room.x + room.w - 12
  const centre = room.x + room.w / 2 + (doorOnLeft ? 8 : -8)
  const table = {
    x: Math.round(centre - CONFERENCE_TABLE.w / 2),
    y: room.y + 34,
    ...CONFERENCE_TABLE
  }
  const boardWidth = Math.min(140, room.w - 48)
  const whiteboard = {
    x: Math.round(centre - boardWidth / 2),
    y: WALL + 3,
    w: boardWidth,
    h: BACK_WALL - WALL - 6
  }
  const northY = room.y + 14
  const southY = room.y + room.h - LANE_INSET
  const chairXs = Array.from(
    { length: CONFERENCE_CHAIRS_PER_SIDE },
    (_, chair) => table.x + 14 + chair * CONFERENCE_CHAIR_PITCH
  )
  chairXs.forEach((x, chair) => {
    draft.anchors.push(
      {
        id: conferenceAnchorId(chair),
        room: 'conference',
        point: { x, y: table.y - 1 },
        approach: { x, y: northY },
        seated: true
      },
      {
        id: conferenceAnchorId(CONFERENCE_CHAIRS_PER_SIDE + chair),
        room: 'conference',
        point: { x, y: table.y + table.h + 14 },
        approach: { x, y: southY },
        seated: true
      }
    )
  })
  // Beside the board, not in front of it, so whoever presents does not cover what is written.
  const presenter = { x: whiteboard.x - 8, y: room.y + 6 }
  draft.anchors.push({
    id: 'whiteboard',
    room: 'conference',
    point: presenter,
    approach: { x: presenter.x, y: northY },
    seated: false
  })
  const first = chairXs[0]
  const last = chairXs[CONFERENCE_CHAIRS_PER_SIDE - 1]
  laneAcross(draft, northY, Math.min(doorX, presenter.x, first), Math.max(doorX, last))
  laneAcross(draft, southY, Math.min(doorX, first), Math.max(doorX, last))
  laneDown(draft, doorX, northY, exit.y)
  return { table, whiteboard, doorX }
}

/** The counter along the back of the kitchen, and standing spots in front of it. */
export function furnishKitchen(
  draft: PlanDraft,
  room: FloorRect,
  doorX: number,
  exitY: number
): FloorRect {
  // The counter stops short on the door's side, so the lane to the door stays clear.
  const doorOnRight = doorX > room.x + room.w / 2
  // The fridge stands taller than the counter. Under the back wall it overlaps the wall's face;
  // behind a partition it would poke into the next room, so the counter sits lower there.
  const counterY = room.y + (room.y > BACK_WALL ? 10 : 0)
  const counter = { x: room.x + (doorOnRight ? 4 : 28), y: counterY, w: room.w - 32, h: 22 }
  const laneY = room.y + room.h - LANE_INSET
  const spotXs = Array.from({ length: KITCHEN_SPOTS }, (_, spot) => counter.x + 10 + spot * 18)
  spotXs.forEach((x, spot) => {
    draft.anchors.push({
      id: kitchenAnchorId(spot),
      room: 'kitchen',
      point: { x, y: counter.y + 40 },
      approach: { x, y: laneY },
      seated: false
    })
  })
  laneAcross(draft, laneY, Math.min(doorX, spotXs[0]), Math.max(doorX, spotXs[KITCHEN_SPOTS - 1]))
  laneDown(draft, doorX, laneY, exitY)
  return counter
}

/** The front desk below the hall lane, its sign panel, and the front door in the left wall. */
export function furnishReception(
  draft: PlanDraft,
  room: FloorRect,
  hallY: number,
  deskGap: number
): { receptionDesk: FloorRect; sign: FloorRect; entrance: FloorRect } {
  const width = Math.min(80, room.w - 16)
  const desk = { x: room.x + (room.w - width) / 2, y: hallY + deskGap, w: width, h: 26 }
  const spot = { x: desk.x + desk.w / 2, y: desk.y - 2 }
  const door = { x: room.x + 8, y: hallY }
  draft.anchors.push(
    {
      id: 'reception',
      room: 'reception',
      point: spot,
      approach: { x: spot.x, y: hallY },
      seated: false
    },
    { id: 'entrance', room: 'reception', point: door, approach: door, seated: false }
  )
  return {
    receptionDesk: desk,
    sign: { x: desk.x + 2, y: desk.y + 11, w: desk.w - 4, h: 13 },
    entrance: { x: room.x - WALL, y: hallY - 12, w: WALL, h: 16 }
  }
}

/**
 * The loading dock in the bottom wall, and the shelf that finished work is stacked on. `doorXs`
 * are the doors in the warehouse's top wall, left to right; the shelf ends before the first.
 */
export function furnishWarehouse(
  draft: PlanDraft,
  room: FloorRect,
  doorXs: readonly number[]
): { shelf: FloorRect; dock: FloorRect; laneY: number } {
  const laneY = room.y + 30
  const dock = { x: room.x + room.w - 64, y: room.y + room.h, w: 44, h: WALL }
  const dockX = dock.x + dock.w / 2
  draft.anchors.push({
    id: 'dock',
    room: 'warehouse',
    point: { x: dockX, y: room.y + room.h - 4 },
    approach: { x: dockX, y: laneY },
    seated: false
  })
  laneAcross(draft, laneY, Math.min(dockX, ...doorXs), Math.max(dockX, ...doorXs))
  const shelfX = room.x + 8
  return {
    shelf: { x: shelfX, y: room.y + 2, w: doorXs[0] - AISLE - shelfX, h: 16 },
    dock,
    laneY
  }
}

/** One pod of desks with its top-left corner at `origin`. */
export function addPod(
  draft: PlanDraft,
  index: number,
  room: FloorRoomId,
  origin: FloorPoint
): FloorPod {
  const desks = Array.from({ length: POD_SEATS }, (_, desk): FloorDesk => {
    const cell = {
      x: origin.x + (desk % POD_DESK_COLUMNS) * DESK_CELL.w,
      y: origin.y + Math.floor(desk / POD_DESK_COLUMNS) * DESK_CELL.h,
      ...DESK_CELL
    }
    const seat = { x: cell.x + DESK_CELL.w / 2, y: cell.y + DESK_SEAT_OFFSET }
    const anchor = seatAnchorId(index, desk)
    draft.anchors.push({
      id: anchor,
      room,
      point: seat,
      approach: { x: seat.x, y: cell.y + DESK_LANE_OFFSET },
      seated: true
    })
    return { anchor, cell, seat }
  })
  return { index, room, rect: { ...origin, ...POD }, desks }
}

/** The lane behind each desk row of a pod row whose top edge is `y`. */
export function addDeskRowLanes(draft: PlanDraft, y: number, x1: number, x2: number): void {
  for (let row = 0; row < POD_SEATS / POD_DESK_COLUMNS; row += 1) {
    laneAcross(draft, y + row * DESK_CELL.h + DESK_LANE_OFFSET, x1, x2)
  }
}
