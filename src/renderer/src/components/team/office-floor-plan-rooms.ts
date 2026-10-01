import type { FloorRect, FloorSegment } from './office-floor-geometry'
import {
  AISLE,
  BACK_WALL,
  DESK_W,
  PARTITION,
  POD_BLOCK,
  SEAT_DROP,
  WALL,
  conferenceAnchorId,
  kitchenAnchorId,
  type FloorAnchor,
  type FloorDesk,
  type FloorDoor,
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
const MANAGER_DESK = { w: 46, h: 22 }
// The office door sits this far in from the room's right wall, clear of the desk's end.
const MANAGER_DOOR_INSET = 10
const CONFERENCE_TABLE = { w: 100, h: 18 }
const CONFERENCE_CHAIRS_PER_SIDE = 4
const CONFERENCE_CHAIR_PITCH = 24
const KITCHEN_SPOTS = 3
const WAREHOUSE_LANE = 32
const STAGING = { w: 84, h: 20 }

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

/**
 * The manager's desk, facing the door in the office's bottom wall. The way out runs along the
 * back of the desk and down the room's door side, so nobody walks through the desk.
 */
export function furnishManagerOffice(
  draft: PlanDraft,
  room: FloorRect,
  exitY: number
): { desk: FloorDesk; doorX: number } {
  const doorX = room.x + room.w - MANAGER_DOOR_INSET
  const seat = { x: doorX - MANAGER_DESK.w / 2 - 11, y: room.y + POD_BLOCK.top }
  const top = { x: seat.x - MANAGER_DESK.w / 2, y: seat.y, ...MANAGER_DESK }
  laneDown(draft, doorX, seat.y, exitY)
  draft.anchors.push({
    id: 'manager',
    room: 'manager',
    point: seat,
    approach: { x: doorX, y: seat.y },
    seated: true,
    facing: 'viewer'
  })
  return {
    desk: {
      anchor: 'manager',
      facing: 'viewer',
      seat,
      cell: { x: seat.x - DESK_W / 2, y: room.y, w: DESK_W, h: top.y + top.h + 12 - room.y },
      top,
      nameplate: { at: { x: seat.x, y: top.y + top.h + 2 }, above: false }
    },
    doorX
  }
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
    y: room.y + 26,
    ...CONFERENCE_TABLE
  }
  // Tall and wide enough for a goal's title with a few subtask lines under it.
  const boardWidth = Math.min(190, room.w - 48)
  const whiteboard = {
    x: Math.round(centre - boardWidth / 2),
    y: WALL + 2,
    w: boardWidth,
    h: BACK_WALL - WALL - 6
  }
  const northY = room.y + 8
  const southY = room.y + room.h - 4
  const chairXs = Array.from(
    { length: CONFERENCE_CHAIRS_PER_SIDE },
    (_, chair) => table.x + 14 + chair * CONFERENCE_CHAIR_PITCH
  )
  chairXs.forEach((x, chair) => {
    draft.anchors.push(
      {
        id: conferenceAnchorId(chair),
        room: 'conference',
        point: { x, y: table.y },
        approach: { x, y: northY },
        seated: true,
        facing: 'viewer'
      },
      {
        id: conferenceAnchorId(CONFERENCE_CHAIRS_PER_SIDE + chair),
        room: 'conference',
        point: { x, y: table.y + table.h + SEAT_DROP },
        approach: { x, y: southY },
        seated: true,
        facing: 'away'
      }
    )
  })
  // Beside the board, not in front of it, so whoever presents does not cover what is written.
  const presenter = { x: whiteboard.x - 8, y: room.y + 4 }
  draft.anchors.push({
    id: 'whiteboard',
    room: 'conference',
    point: presenter,
    approach: { x: presenter.x, y: northY },
    seated: false,
    facing: 'viewer'
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
      seated: false,
      facing: 'viewer'
    })
  })
  laneAcross(draft, laneY, Math.min(doorX, spotXs[0]), Math.max(doorX, spotXs[KITCHEN_SPOTS - 1]))
  laneDown(draft, doorX, laneY, exitY)
  return counter
}

/** The front desk below the hall lane, its sign and note tray, and the front door in the left wall. */
export function furnishReception(
  draft: PlanDraft,
  room: FloorRect,
  hallY: number,
  deskGap: number
): { receptionDesk: FloorRect; sign: FloorRect; noteTray: FloorRect; entrance: FloorRect } {
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
      seated: false,
      facing: 'viewer'
    },
    {
      id: 'entrance',
      room: 'reception',
      point: door,
      approach: door,
      seated: false,
      facing: 'viewer'
    }
  )
  return {
    receptionDesk: desk,
    sign: { x: desk.x + 2, y: desk.y + 11, w: desk.w - 4, h: 13 },
    noteTray: { x: desk.x + desk.w - 20, y: desk.y + 2, w: 16, h: 7 },
    entrance: { x: room.x - WALL, y: hallY - 12, w: WALL, h: 16 }
  }
}

/**
 * The loading dock in the bottom wall, the staging area beside it, and the racks along the back.
 * `doorXs` are the doors in the warehouse's top wall, left to right; the racks end before the
 * first. The lane runs between the racks and the staging area, so both stay clear of it.
 */
export function furnishWarehouse(
  draft: PlanDraft,
  room: FloorRect,
  doorXs: readonly number[]
): { shelf: FloorRect; staging: FloorRect; dock: FloorRect; laneY: number } {
  const laneY = room.y + WAREHOUSE_LANE
  const dock = { x: room.x + room.w - 64, y: room.y + room.h, w: 44, h: WALL }
  const dockX = dock.x + dock.w / 2
  draft.anchors.push({
    id: 'dock',
    room: 'warehouse',
    point: { x: dockX, y: room.y + room.h - 4 },
    approach: { x: dockX, y: laneY },
    seated: false,
    facing: 'viewer'
  })
  laneAcross(draft, laneY, Math.min(dockX, ...doorXs), Math.max(dockX, ...doorXs))
  const shelfX = room.x + 8
  const stagingW = Math.min(STAGING.w, dock.x - 8 - (room.x + 4))
  return {
    shelf: { x: shelfX, y: room.y + 1, w: doorXs[0] - AISLE - shelfX, h: 22 },
    staging: {
      x: dock.x - 8 - stagingW,
      y: room.y + room.h - STAGING.h - 2,
      w: stagingW,
      h: STAGING.h
    },
    dock,
    laneY
  }
}
