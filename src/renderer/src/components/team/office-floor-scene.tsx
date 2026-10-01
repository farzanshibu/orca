import React from 'react'
import {
  BACK_WALL,
  WALL,
  floorRoom,
  type FloorDoor,
  type FloorRect,
  type FloorWall,
  type OfficeFloorPlan
} from './office-floor-plan'
import { Px } from './office-floor-sprite'

const WINDOW_W = 26
const WINDOW_Y = 17

function Window({ x }: { x: number }): React.JSX.Element {
  const y = WINDOW_Y
  return (
    <g>
      <Px x={x} y={y} w={WINDOW_W} h={12} c="ink" />
      <Px x={x + 1} y={y + 1} w={24} h={10} c="sky" />
      <Px x={x + 2} y={y + 2} w={6} h={2} c="sky-glint" />
      <Px x={x + 12} y={y + 1} w={2} h={10} c="ink" />
      <Px x={x - 1} y={y + 11} w={28} h={2} c="wall-trim" />
    </g>
  )
}

function Plant({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x + 1} y={y} w={8} h={7} c="ink" />
      <Px x={x + 2} y={y + 1} w={6} h={5} c="plant" />
      <Px x={x} y={y + 3} w={3} h={3} c="plant-dark" />
      <Px x={x + 7} y={y + 3} w={3} h={3} c="plant-dark" />
      <Px x={x + 2} y={y + 7} w={6} h={6} c="ink" />
      <Px x={x + 3} y={y + 7} w={4} h={5} c="pot" />
    </g>
  )
}

/** The board itself. Its text is HTML in the overlay; `blank` leaves the surface clear for it. */
function Whiteboard({ rect, blank }: { rect: FloorRect; blank: boolean }): React.JSX.Element {
  const { x, y, w, h } = rect
  return (
    <g>
      <Px x={x} y={y} w={w} h={h} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={h - 2} c="whiteboard" />
      <Px x={x + 6} y={y + h} w={w - 12} h={1} c="metal" />
      {blank ? null : (
        <>
          <Px x={x + 6} y={y + 6} w={28} h={1} c="marker-blue" />
          <Px x={x + 6} y={y + 11} w={40} h={1} c="marker-blue" />
          <Px x={x + 6} y={y + 16} w={18} h={1} c="marker-red" />
          <Px x={x + w - 30} y={y + 6} w={22} h={14} c="marker-green" />
          <Px x={x + w - 29} y={y + 7} w={20} h={12} c="whiteboard" />
        </>
      )}
    </g>
  )
}

function Wall({ wall }: { wall: FloorWall }): React.JSX.Element {
  const { x, y, w, h } = wall.rect
  if (wall.kind === 'glass') {
    return <Px x={x} y={y} w={w} h={h} c="glass" />
  }
  return (
    <g>
      <Px x={x} y={y} w={w} h={h} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={h - 2} c="wall-top" />
    </g>
  )
}

/** A sill across the opening, so a door reads as a way through and not a gap in the art. */
function Doorway({ door }: { door: FloorDoor }): React.JSX.Element {
  const { x, y, w, h } = door.rect
  return w > h ? (
    <Px x={x} y={y + 1} w={w} h={h - 2} c="floor-line" />
  ) : (
    <Px x={x + 1} y={y} w={w - 2} h={h} c="floor-line" />
  )
}

function ConferenceTable({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element {
  const table = plan.fixtures.conferenceTable
  const chairs = plan.anchors.filter((anchor) => anchor.id.startsWith('conference:'))
  return (
    <g>
      {chairs.map(({ id, point }) => {
        const y = point.y < table.y ? table.y - 6 : table.y + table.h
        return (
          <g key={id}>
            <Px x={point.x - 4} y={y} w={8} h={6} c="ink" />
            <Px x={point.x - 3} y={y + 1} w={6} h={4} c="fabric" />
          </g>
        )
      })}
      <Px x={table.x} y={table.y} w={table.w} h={table.h} c="ink" />
      <Px x={table.x + 1} y={table.y + 1} w={table.w - 2} h={table.h - 4} c="wood" />
      <Px x={table.x + 1} y={table.y + table.h - 3} w={table.w - 2} h={2} c="wood-dark" />
    </g>
  )
}

/** Counter with a coffee machine, a sink where there is room, and the fridge at its far end. */
function KitchenCounter({ rect }: { rect: FloorRect }): React.JSX.Element {
  const { x, y } = rect
  const run = rect.w - 26
  const fridge = x + rect.w - 24
  return (
    <g>
      <Px x={x} y={y} w={run} h={22} c="ink" />
      <Px x={x + 1} y={y} w={run - 2} h={14} c="counter" />
      <Px x={x + 1} y={y + 14} w={run - 2} h={7} c="cabinet" />
      <Px x={x + 4} y={y - 6} w={11} h={14} c="ink" />
      <Px x={x + 5} y={y - 5} w={9} h={12} c="metal-dark" />
      <Px x={x + 7} y={y - 3} w={2} h={2} c="marker-red" />
      {run >= 46 ? (
        <>
          <Px x={x + 24} y={y + 3} w={16} h={8} c="ink" />
          <Px x={x + 25} y={y + 4} w={14} h={6} c="metal" />
        </>
      ) : null}
      <Px x={fridge} y={y - 10} w={24} h={34} c="ink" />
      <Px x={fridge + 1} y={y - 9} w={22} h={32} c="fridge" />
      <Px x={fridge + 1} y={y + 2} w={22} h={1} c="ink" />
      <Px x={fridge + 19} y={y - 5} w={1} h={4} c="ink" />
    </g>
  )
}

function ReceptionDesk({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element {
  const { receptionDesk: desk, sign, entrance } = plan.fixtures
  return (
    <g>
      <Px x={entrance.x + 1} y={entrance.y} w={entrance.w - 2} h={entrance.h} c="ink" />
      <Px x={entrance.x + 2} y={entrance.y + 1} w={entrance.w - 4} h={entrance.h - 2} c="wood" />
      <Px x={desk.x + 2} y={desk.y + desk.h} w={desk.w - 4} h={2} c="shadow" />
      <Px x={desk.x} y={desk.y} w={desk.w} h={desk.h} c="ink" />
      <Px x={desk.x + 1} y={desk.y + 1} w={desk.w - 2} h={9} c="wood" />
      <Px x={desk.x + 1} y={desk.y + 1} w={desk.w - 2} h={1} c="wood-light" />
      <Px x={desk.x + 1} y={desk.y + 10} w={desk.w - 2} h={desk.h - 11} c="wood-dark" />
      <Px x={sign.x} y={sign.y} w={sign.w} h={sign.h} c="sign" />
    </g>
  )
}

function Couch({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x - 6} y={y - 14} w={80} h={12} c="rug" />
      <Px x={x} y={y} w={68} h={22} c="ink" />
      <Px x={x + 1} y={y + 1} w={66} h={8} c="fabric-dark" />
      <Px x={x + 1} y={y + 9} w={66} h={12} c="fabric" />
      <Px x={x + 23} y={y + 9} w={1} h={12} c="fabric-dark" />
      <Px x={x + 45} y={y + 9} w={1} h={12} c="fabric-dark" />
    </g>
  )
}

function PingPong({ x, y }: { x: number; y: number }): React.JSX.Element {
  const w = 44
  const h = 24
  return (
    <g>
      <Px x={x + 2} y={y + h} w={w - 4} h={2} c="shadow" />
      <Px x={x} y={y} w={w} h={h} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={h - 2} c="table-green" />
      <Px x={x + 1} y={y + h / 2} w={w - 2} h={1} c="paper" />
      <Px x={x + w / 2} y={y - 2} w={1} h={h + 4} c="paper" />
      <Px x={x + 8} y={y + 6} w={2} h={2} c="paper" />
    </g>
  )
}

function Warehouse({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element {
  const { shelf, dock } = plan.fixtures
  return (
    <g>
      <Px x={shelf.x} y={shelf.y} w={shelf.w} h={shelf.h} c="ink" />
      <Px x={shelf.x + 1} y={shelf.y + 1} w={shelf.w - 2} h={shelf.h - 2} c="metal-dark" />
      <Px x={shelf.x + 1} y={shelf.y + shelf.h - 3} w={shelf.w - 2} h={2} c="metal" />
      <Px x={dock.x} y={dock.y} w={dock.w} h={dock.h} c="ink" />
      <Px x={dock.x + 1} y={dock.y + 1} w={dock.w - 2} h={2} c="metal" />
      <Px x={dock.x + 1} y={dock.y + 4} w={dock.w - 2} h={2} c="metal" />
    </g>
  )
}

/** Window positions along the back wall, leaving the whiteboard's stretch of wall clear. */
function windowXs(plan: OfficeFloorPlan): number[] {
  const board = plan.fixtures.whiteboard
  const xs: number[] = []
  for (let x = WALL + 18; x + WINDOW_W < plan.width - WALL - 8; x += 48) {
    if (x + WINDOW_W < board.x - 6 || x > board.x + board.w + 6) {
      xs.push(x)
    }
  }
  return xs
}

/** Everything that never moves: floors, walls, doors, windows, and the rooms' furniture. */
export function OfficeBackdrop({
  plan,
  whiteboardBlank
}: {
  plan: OfficeFloorPlan
  /** The overlay is writing on the whiteboard, so the scribbles are left off. */
  whiteboardBlank: boolean
}): React.JSX.Element {
  const { width, height, fixtures } = plan
  const manager = floorRoom(plan, 'manager')?.rect
  const kitchen = floorRoom(plan, 'kitchen')?.rect
  const reception = floorRoom(plan, 'reception')?.rect
  const warehouse = floorRoom(plan, 'warehouse')?.rect
  const annex = floorRoom(plan, 'annex')?.rect
  const annexEmpty = !plan.pods.some((pod) => pod.room === 'annex')
  return (
    <g>
      <defs>
        <pattern id="team-office-boards" width={16} height={16} patternUnits="userSpaceOnUse">
          <Px x={0} y={0} w={16} h={16} c="floor" />
          <Px x={0} y={15} w={16} h={1} c="floor-line" />
          <Px x={15} y={0} w={1} h={16} c="floor-line" />
        </pattern>
        <pattern id="team-office-tiles" width={16} height={16} patternUnits="userSpaceOnUse">
          <Px x={0} y={0} w={16} h={16} c="tile" />
          <Px x={0} y={0} w={8} h={8} c="tile-alt" />
          <Px x={8} y={8} w={8} h={8} c="tile-alt" />
        </pattern>
        <pattern id="team-office-concrete" width={32} height={32} patternUnits="userSpaceOnUse">
          <Px x={0} y={0} w={32} h={32} c="concrete" />
          <Px x={0} y={31} w={32} h={1} c="concrete-line" />
          <Px x={31} y={0} w={1} h={32} c="concrete-line" />
        </pattern>
      </defs>
      <Px x={0} y={0} w={width} h={height} c="ink" />
      <Px x={1} y={1} w={width - 2} h={height - 2} c="wall-top" />
      <rect
        x={WALL}
        y={BACK_WALL}
        width={width - WALL * 2}
        height={height - BACK_WALL - WALL}
        fill="url(#team-office-boards)"
      />
      {kitchen ? (
        <rect
          x={kitchen.x}
          y={kitchen.y}
          width={kitchen.w}
          height={kitchen.h}
          fill="url(#team-office-tiles)"
        />
      ) : null}
      {warehouse ? (
        <rect
          x={warehouse.x}
          y={warehouse.y}
          width={warehouse.w}
          height={warehouse.h}
          fill="url(#team-office-concrete)"
        />
      ) : null}
      <Px x={WALL} y={WALL} w={width - WALL * 2} h={BACK_WALL - WALL} c="wall-face" />
      <Px x={WALL} y={BACK_WALL - 2} w={width - WALL * 2} h={2} c="wall-trim" />
      {windowXs(plan).map((x) => (
        <Window key={x} x={x} />
      ))}
      <Whiteboard rect={fixtures.whiteboard} blank={whiteboardBlank} />
      {manager ? (
        <>
          <Px x={manager.x + 10} y={manager.y + 14} w={manager.w - 20} h={manager.h - 20} c="rug" />
          <Px
            x={manager.x + 12}
            y={manager.y + 16}
            w={manager.w - 24}
            h={manager.h - 24}
            c="rug-inner"
          />
          <Plant x={manager.x + 2} y={manager.y + manager.h - 16} />
        </>
      ) : null}
      {plan.walls
        .filter((wall) => wall.kind !== 'shell')
        .map((wall) => (
          <Wall key={Object.values(wall.rect).join(':')} wall={wall} />
        ))}
      {plan.doors.map((door) => (
        <Doorway key={door.id} door={door} />
      ))}
      <ConferenceTable plan={plan} />
      <KitchenCounter rect={fixtures.kitchenCounter} />
      <ReceptionDesk plan={plan} />
      {reception && reception.h >= 120 ? (
        <>
          <Couch x={reception.x + 10} y={reception.y + reception.h - 30} />
          <Plant x={reception.x + 2} y={reception.y + reception.h - 62} />
        </>
      ) : null}
      {/* Between the annex's two desk-row lanes, so nobody walks through the table. */}
      {annex && annexEmpty ? <PingPong x={annex.x + annex.w / 2 - 22} y={annex.y + 100} /> : null}
      <Warehouse plan={plan} />
    </g>
  )
}
