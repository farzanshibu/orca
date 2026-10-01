import React from 'react'
import { ChairBack, ChairFront, ChairSeat, PaperSheet } from './office-floor-desk-art'
import {
  Beanbag,
  CoffeeTable,
  Copier,
  Couch,
  FilingCabinet,
  GamesTable,
  Plant,
  Rug,
  TallPlant,
  WallFrame
} from './office-floor-furnishings'
import {
  BACK_WALL,
  WALL,
  floorRoom,
  type FloorPodSlot,
  type FloorRect,
  type OfficeFloorPlan
} from './office-floor-plan'
import { Px } from './office-floor-sprite'

// The waiting area at the foot of reception: a rug with the couch and a low table on it.
const LOUNGE_H = 50

/** A table or desk top seen from above its front edge: a surface over a darker front panel. */
function WoodTop({ rect, front }: { rect: FloorRect; front: number }): React.JSX.Element {
  const { x, y, w, h } = rect
  return (
    <g>
      <Px x={x + 2} y={y + h} w={w - 4} h={2} c="shadow" />
      <Px x={x} y={y} w={w} h={h} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={h - front - 1} c="wood" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={1} c="wood-light" />
      <Px x={x + 1} y={y + h - front} w={w - 2} h={front - 1} c="wood-dark" />
    </g>
  )
}

/** The manager's glass office: the desk that faces the door, on a rug, with a plant and files. */
export function ManagerOffice({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element | null {
  const room = floorRoom(plan, 'manager')?.rect
  if (!room) {
    return null
  }
  const { top } = plan.managerDesk
  return (
    <g>
      <Rug rect={{ x: top.x - 6, y: top.y + top.h - 8, w: top.w + 12, h: 30 }} />
      {room.y === BACK_WALL ? <WallFrame x={room.x + 7} y={WALL + 12} /> : null}
      {top.x - room.x >= 18 ? <TallPlant x={room.x + 3} y={room.y + 3} /> : null}
      <FilingCabinet x={room.x + 3} y={room.y + room.h - 24} />
      <WoodTop rect={top} front={6} />
      <Px x={top.x + 4} y={top.y + top.h - 4} w={top.w - 8} h={1} c="wood" />
    </g>
  )
}

/** The board itself. Its text is HTML in the overlay; `blank` leaves the surface clear for it. */
function Whiteboard({ rect, blank }: { rect: FloorRect; blank: boolean }): React.JSX.Element {
  const { x, y, w, h } = rect
  return (
    <g>
      <Px x={x - 1} y={y - 1} w={w + 2} h={h + 2} c="ink" />
      <Px x={x} y={y} w={w} h={h} c="metal" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={h - 2} c="whiteboard" />
      <Px x={x + 6} y={y + h + 1} w={w - 12} h={2} c="ink" />
      <Px x={x + 7} y={y + h + 1} w={w - 14} h={1} c="metal" />
      <Px x={x + 12} y={y + h} w={5} h={1} c="marker-blue" />
      <Px x={x + 19} y={y + h} w={5} h={1} c="marker-red" />
      <Px x={x + 26} y={y + h} w={5} h={1} c="marker-green" />
      {blank ? null : (
        <>
          <Px x={x + 8} y={y + 6} w={38} h={2} c="marker-blue" />
          <Px x={x + 8} y={y + 13} w={52} h={1} c="marker-blue" />
          <Px x={x + 8} y={y + 18} w={40} h={1} c="marker-blue" />
          <Px x={x + 8} y={y + 23} w={46} h={1} c="marker-red" />
          <Px x={x + w - 38} y={y + 6} w={30} h={20} c="marker-green" />
          <Px x={x + w - 37} y={y + 7} w={28} h={18} c="whiteboard" />
          <Px x={x + w - 33} y={y + 17} w={4} h={8} c="marker-green" />
          <Px x={x + w - 26} y={y + 12} w={4} h={13} c="marker-blue" />
          <Px x={x + w - 19} y={y + 15} w={4} h={10} c="marker-red" />
        </>
      )}
    </g>
  )
}

/** The conference room: the whiteboard on the back wall, and the meeting table with its chairs. */
export function ConferenceRoom({
  plan,
  whiteboardBlank
}: {
  plan: OfficeFloorPlan
  /** The overlay is writing on the whiteboard, so the scribbles are left off. */
  whiteboardBlank: boolean
}): React.JSX.Element | null {
  const room = floorRoom(plan, 'conference')
  if (!room) {
    return null
  }
  const { rect } = room
  const table = plan.fixtures.conferenceTable
  const chairs = plan.anchors.filter((anchor) => anchor.id.startsWith('conference:'))
  // Dressing goes on the side away from the door, where no lane runs.
  const doorOnLeft = room.doors.every((door) => door.rect.x < rect.x + rect.w / 2)
  const farX = doorOnLeft ? rect.x + rect.w - 15 : rect.x + 3
  return (
    <g>
      <Whiteboard rect={plan.fixtures.whiteboard} blank={whiteboardBlank} />
      {rect.w >= 240 ? (
        <g>
          <Px x={rect.x + rect.w - 62} y={rect.y + 1} w={46} h={13} c="ink" />
          <Px x={rect.x + rect.w - 61} y={rect.y + 1} w={44} h={5} c="wood-light" />
          <Px x={rect.x + rect.w - 61} y={rect.y + 6} w={44} h={7} c="wood-dark" />
          <Px x={rect.x + rect.w - 39} y={rect.y + 6} w={1} h={7} c="ink" />
          <Px x={rect.x + rect.w - 56} y={rect.y - 3} w={5} h={6} c="ink" />
          <Px x={rect.x + rect.w - 55} y={rect.y - 2} w={3} h={4} c="glass-pane" />
          <Px x={rect.x + rect.w - 48} y={rect.y} w={3} h={3} c="paper" />
          <Px x={rect.x + rect.w - 43} y={rect.y} w={3} h={3} c="paper" />
        </g>
      ) : null}
      <TallPlant x={farX} y={rect.y + rect.h - 26} />
      {chairs
        .filter((chair) => chair.facing === 'viewer')
        .map((chair) => (
          <ChairFront key={chair.id} at={chair.point} vacant />
        ))}
      <WoodTop rect={table} front={4} />
      <PaperSheet x={table.x + 18} y={table.y + 3} />
      <PaperSheet x={table.x + table.w - 30} y={table.y + 4} />
      <Px x={table.x + table.w / 2 - 5} y={table.y + 5} w={10} h={5} c="ink" />
      <Px x={table.x + table.w / 2 - 4} y={table.y + 6} w={8} h={3} c="metal-dark" />
      <Px x={table.x + table.w / 2 - 1} y={table.y + 7} w={2} h={1} c="marker-green" />
      {chairs
        .filter((chair) => chair.facing === 'away')
        .map((chair) => (
          <g key={chair.id}>
            <ChairSeat at={chair.point} />
            <ChairBack at={chair.point} />
          </g>
        ))}
    </g>
  )
}

/**
 * Reception: the front door and its mat, the desk whose front panel is the sign, the tray notes
 * land in, and a place to wait where the room is long enough. The sign's text is in the overlay.
 */
export function Reception({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element | null {
  const room = floorRoom(plan, 'reception')?.rect
  if (!room) {
    return null
  }
  const { receptionDesk: desk, sign, noteTray, entrance } = plan.fixtures
  const bottom = room.y + room.h
  const below = bottom - (desk.y + desk.h)
  const lounge = below >= LOUNGE_H + 12
  return (
    <g>
      <Rug rect={{ x: room.x + 1, y: entrance.y - 2, w: 14, h: entrance.h + 4 }} />
      <Px x={entrance.x + 1} y={entrance.y - 1} w={entrance.w - 1} h={entrance.h + 2} c="ink" />
      <Px x={entrance.x + 2} y={entrance.y} w={entrance.w - 3} h={entrance.h} c="glass-pane" />
      <Px x={entrance.x + 2} y={entrance.y + entrance.h / 2} w={entrance.w - 3} h={1} c="ink" />
      <Px x={entrance.x + 5} y={entrance.y + entrance.h / 2 - 3} w={1} h={2} c="metal-dark" />
      <Px x={entrance.x + 5} y={entrance.y + entrance.h / 2 + 2} w={1} h={2} c="metal-dark" />
      {lounge ? (
        <>
          <Rug rect={{ x: room.x + 6, y: bottom - LOUNGE_H, w: room.w - 12, h: LOUNGE_H - 4 }} />
          <Couch x={room.x + 10} y={bottom - LOUNGE_H + 4} />
          <CoffeeTable x={room.x + 31} y={bottom - 20} />
          {below >= LOUNGE_H + 40 ? <TallPlant x={room.x + 3} y={desk.y + desk.h + 8} /> : null}
        </>
      ) : (
        <Plant x={desk.x - 14} y={desk.y + 11} />
      )}
      <WoodTop rect={desk} front={16} />
      <Px x={sign.x - 1} y={sign.y - 1} w={sign.w + 2} h={sign.h + 2} c="ink" />
      <Px x={sign.x} y={sign.y} w={sign.w} h={sign.h} c="sign" />
      <Px x={noteTray.x} y={noteTray.y} w={noteTray.w} h={noteTray.h} c="ink" />
      <Px x={noteTray.x + 1} y={noteTray.y + 1} w={noteTray.w - 2} h={noteTray.h - 2} c="metal" />
      <Px x={desk.x + 7} y={desk.y + 3} w={5} h={4} c="ink" />
      <Px x={desk.x + 8} y={desk.y + 4} w={3} h={2} c="marking" />
      <Px x={desk.x + 9} y={desk.y + 2} w={1} h={1} c="ink" />
    </g>
  )
}

/** What fills a reserved pod place until a pod moves in: games in the annex, a copy corner elsewhere. */
function VacantSlot({ slot }: { slot: FloorPodSlot }): React.JSX.Element {
  const { x, y, w } = slot.rect
  if (slot.room === 'annex') {
    return (
      <g>
        <Rug rect={{ x: x + 20, y: y + 24, w: w - 40, h: 52 }} />
        <GamesTable x={x + w / 2 - 22} y={y + 38} />
        <Beanbag x={x + 4} y={y + 6} />
        <Beanbag x={x + w - 22} y={y + 80} />
        <Plant x={x + w - 12} y={y + 4} />
      </g>
    )
  }
  return (
    <g>
      <Copier x={x + 12} y={y + 30} />
      <FilingCabinet x={x + 50} y={y + 32} />
      <FilingCabinet x={x + 65} y={y + 32} />
      <TallPlant x={x + 90} y={y + 30} />
    </g>
  )
}

/** The annex and any bullpen floor still waiting for a pod. */
export function CommonAreas({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element {
  return (
    <g>
      {plan.vacantSlots.map((slot) => (
        <VacantSlot key={`${slot.rect.x}:${slot.rect.y}`} slot={slot} />
      ))}
    </g>
  )
}
