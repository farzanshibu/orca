/**
 * Geometry of the pixel-art office, in art units (one unit = one art pixel). The scene SVG and the
 * character overlay both read these numbers, so nothing on the floor is measured from the DOM.
 */

export type FloorPoint = { x: number; y: number }
export type FloorRect = { x: number; y: number; w: number; h: number }

export type FloorDesk = {
  /** Desk cell; the desk, monitor and chair are drawn relative to it. */
  cell: FloorRect
  /** Where a seated character's feet rest. */
  seat: FloorPoint
}

export type FloorLayout = {
  width: number
  height: number
  /** Break room beside the desks on wide floors, below them on narrow ones. */
  breakRoom: FloorRect
  breakRoomBeside: boolean
  managerOffice: FloorRect
  managerDesk: FloorDesk
  /** Null when the open plan is too narrow to fit one beside the manager's office. */
  meetingTable: FloorRect | null
  desks: FloorDesk[]
  /** Spots an idle character can stand or sit at, most inviting first. */
  idleSpots: FloorPoint[]
  /** Only tall break rooms have space for it. */
  pingPong: FloorRect | null
}

export const WALL = 8
export const BACK_WALL = 28
export const DESK_CELL = { w: 64, h: 76 }
const BREAK_ROOM_W = 144
const BREAK_ROOM_H = 150
const OFFICE_ROW_H = 78

export function floorColumns(containerWidth: number): number {
  if (containerWidth >= 1100) {
    return 4
  }
  if (containerWidth >= 760) {
    return 3
  }
  return 2
}

function deskAt(x: number, y: number): FloorDesk {
  return {
    cell: { x, y, w: DESK_CELL.w, h: DESK_CELL.h },
    seat: { x: x + DESK_CELL.w / 2, y: y + 50 }
  }
}

/** Lays out `deskCount` staff desks in `columns` columns, plus the manager's office and break room. */
export function floorLayout(deskCount: number, columns: number): FloorLayout {
  const cols = Math.max(2, columns)
  const rows = Math.max(1, Math.ceil(deskCount / cols))
  const deskAreaX = WALL + 8
  const deskAreaW = cols * DESK_CELL.w
  const officeY = BACK_WALL
  const desksY = officeY + OFFICE_ROW_H + 10
  const desksBottom = desksY + rows * DESK_CELL.h + 6
  const breakRoomBeside = cols >= 3
  const openPlanRight = deskAreaX + deskAreaW + 8

  const breakRoom: FloorRect = breakRoomBeside
    ? {
        x: openPlanRight + WALL,
        y: BACK_WALL,
        w: BREAK_ROOM_W,
        h: Math.max(desksBottom, BACK_WALL + BREAK_ROOM_H + 40) - BACK_WALL
      }
    : {
        x: WALL,
        y: desksBottom + WALL,
        w: openPlanRight - WALL,
        h: BREAK_ROOM_H
      }
  const width = (breakRoomBeside ? breakRoom.x + breakRoom.w : openPlanRight) + WALL
  const height = breakRoom.y + breakRoom.h + WALL

  const managerOffice: FloorRect = {
    x: WALL,
    y: officeY,
    w: DESK_CELL.w * 2 - 4,
    h: OFFICE_ROW_H
  }
  const managerDesk = deskAt(managerOffice.x + (managerOffice.w - DESK_CELL.w) / 2, officeY + 8)
  const meetingX = managerOffice.x + managerOffice.w + 16
  const meetingW = openPlanRight - meetingX - 16
  const meetingTable: FloorRect | null =
    meetingW >= 40 ? { x: meetingX, y: officeY + 22, w: meetingW, h: 22 } : null

  const desks: FloorDesk[] = []
  for (let index = 0; index < deskCount; index += 1) {
    desks.push(
      deskAt(
        deskAreaX + (index % cols) * DESK_CELL.w,
        desksY + Math.floor(index / cols) * DESK_CELL.h
      )
    )
  }

  const b = breakRoom
  const idleSpots: FloorPoint[] = [
    // Couch cushions, coffee machine, fridge, water cooler, bistro stools, then the meeting table.
    { x: b.x + b.w / 2 - 22, y: b.y + b.h - 18 },
    { x: b.x + b.w / 2, y: b.y + b.h - 18 },
    { x: b.x + b.w / 2 + 22, y: b.y + b.h - 18 },
    { x: b.x + 16, y: b.y + 44 },
    { x: b.x + b.w - 18, y: b.y + 48 },
    { x: b.x + 26, y: b.y + 76 },
    { x: b.x + b.w / 2, y: b.y + 72 },
    { x: b.x + b.w / 2 + 26, y: b.y + 72 }
  ]
  if (meetingTable) {
    const standY = meetingTable.y + meetingTable.h + 22
    idleSpots.push(
      { x: meetingTable.x + 12, y: standY },
      { x: meetingTable.x + meetingTable.w - 12, y: standY }
    )
  }

  const pingPong: FloorRect | null =
    b.h >= 210 ? { x: b.x + b.w / 2 - 22, y: b.y + Math.round(b.h * 0.5), w: 44, h: 24 } : null
  if (pingPong) {
    idleSpots.push(
      { x: pingPong.x - 10, y: pingPong.y + 20 },
      { x: pingPong.x + pingPong.w + 10, y: pingPong.y + 20 }
    )
  }

  return {
    pingPong,
    width,
    height,
    breakRoom,
    breakRoomBeside,
    managerOffice,
    managerDesk,
    meetingTable,
    desks,
    idleSpots
  }
}
