import React from 'react'
import {
  BACK_WALL,
  DESK_CELL,
  WALL,
  type FloorDesk,
  type FloorLayout,
  type FloorRect
} from './office-floor-layout'
import type { FloorActivity } from './office-floor-state'
import { Px } from './office-floor-sprite'

export type ScreenState = FloorActivity | 'vacant'

// Desk art is 56 units wide; centre it in the wider cell so rows get an aisle.
const DESK_INSET = (DESK_CELL.w - 56) / 2

function Window({ x }: { x: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={11} w={26} h={12} c="ink" />
      <Px x={x + 1} y={12} w={24} h={10} c="sky" />
      <Px x={x + 2} y={13} w={6} h={2} c="sky-glint" />
      <Px x={x + 12} y={12} w={2} h={10} c="ink" />
      <Px x={x - 1} y={22} w={28} h={2} c="wall-trim" />
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

function Whiteboard({ x }: { x: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={10} w={44} h={15} c="ink" />
      <Px x={x + 1} y={11} w={42} h={13} c="paper" />
      <Px x={x + 4} y={14} w={12} h={1} c="marker-blue" />
      <Px x={x + 4} y={17} w={18} h={1} c="marker-blue" />
      <Px x={x + 4} y={20} w={8} h={1} c="marker-red" />
      <Px x={x + 27} y={14} w={10} h={7} c="marker-green" />
      <Px x={x + 28} y={15} w={8} h={5} c="paper" />
    </g>
  )
}

/** Monitor contents at a glance: code while working, a question while blocked, a screensaver on a break. */
function Screen({ x, y, state }: { x: number; y: number; state: ScreenState }): React.JSX.Element {
  if (state === 'working') {
    return (
      <g>
        <Px x={x} y={y} w={16} h={10} c="screen-work" />
        <Px x={x + 2} y={y + 2} w={7} h={1} c="screen-line" />
        <Px x={x + 4} y={y + 4} w={8} h={1} c="screen-line" />
        <Px x={x + 4} y={y + 6} w={5} h={1} c="screen-line" />
        <g className="team-office-cursor">
          <Px x={x + 10} y={y + 6} w={2} h={1} c="screen-line" />
        </g>
      </g>
    )
  }
  if (state === 'waiting') {
    return (
      <g className="team-office-blink">
        <Px x={x} y={y} w={16} h={10} c="screen-wait" />
        <Px x={x + 6} y={y + 2} w={4} h={1} c="ink" />
        <Px x={x + 9} y={y + 3} w={1} h={2} c="ink" />
        <Px x={x + 7} y={y + 5} w={2} h={1} c="ink" />
        <Px x={x + 7} y={y + 7} w={2} h={1} c="ink" />
      </g>
    )
  }
  if (state === 'idle') {
    return (
      <g>
        <Px x={x} y={y} w={16} h={10} c="screen-idle" />
        <Px x={x + 5} y={y + 3} w={3} h={3} c="screen-line" />
      </g>
    )
  }
  return <Px x={x} y={y} w={16} h={10} c="screen-off" />
}

/** Desk, monitor, keyboard and clutter; drawn behind the seated character. */
export function DeskTop({
  desk,
  state
}: {
  desk: FloorDesk
  state: ScreenState
}): React.JSX.Element {
  const x = desk.cell.x + DESK_INSET
  const { y } = desk.cell
  return (
    <g>
      <Px x={x + 6} y={y + 28} w={44} h={2} c="shadow" />
      <Px x={x + 5} y={y + 9} w={46} h={19} c="ink" />
      <Px x={x + 6} y={y + 10} w={44} h={14} c="wood" />
      <Px x={x + 6} y={y + 10} w={44} h={1} c="wood-light" />
      <Px x={x + 6} y={y + 24} w={44} h={3} c="wood-dark" />
      <Px x={x + 9} y={y + 13} w={7} h={9} c="paper" />
      <Px x={x + 10} y={y + 15} w={5} h={1} c="paper-line" />
      <Px x={x + 10} y={y + 17} w={4} h={1} c="paper-line" />
      <Px x={x + 41} y={y + 14} w={5} h={5} c="ink" />
      <Px x={x + 42} y={y + 15} w={3} h={3} c="mug" />
      <Px x={x + 19} y={y + 1} w={18} h={13} c="ink" />
      <Screen x={x + 20} y={y + 2} state={state} />
      <Px x={x + 26} y={y + 14} w={4} h={2} c="ink" />
      <Px x={x + 23} y={y + 16} w={10} h={1} c="ink" />
      <Px x={x + 20} y={y + 19} w={16} h={4} c="ink" />
      <Px x={x + 21} y={y + 20} w={14} h={2} c="metal" />
    </g>
  )
}

/** The chair back sits between the viewer and a seated character, so it is drawn after them. */
export function ChairBack({ x: cellX, y }: { x: number; y: number }): React.JSX.Element {
  const x = cellX + DESK_INSET
  return (
    <g>
      <Px x={x + 20} y={y + 44} w={16} h={7} c="ink" />
      <Px x={x + 21} y={y + 45} w={14} h={5} c="chair" />
      <Px x={x + 21} y={y + 45} w={14} h={1} c="chair-light" />
      <Px x={x + 27} y={y + 51} w={2} h={2} c="ink" />
      <Px x={x + 23} y={y + 53} w={10} h={1} c="ink" />
    </g>
  )
}

/** Cell origin in, like ChairBack; only drawn when nobody is sitting. */
export function ChairSeat({ x: cellX, y }: { x: number; y: number }): React.JSX.Element {
  const x = cellX + DESK_INSET
  return (
    <g>
      <Px x={x + 21} y={y + 34} w={14} h={11} c="ink" />
      <Px x={x + 22} y={y + 35} w={12} h={9} c="chair-dark" />
      <Px x={x + 19} y={y + 36} w={2} h={6} c="ink" />
      <Px x={x + 35} y={y + 36} w={2} h={6} c="ink" />
    </g>
  )
}

function Partition({ rect, door }: { rect: FloorRect; door: FloorRect }): React.JSX.Element {
  const { x, y, w, h } = rect
  const vertical = h > w
  const before = vertical ? door.y - y : door.x - x
  const afterStart = vertical ? door.y + door.h : door.x + door.w
  const after = vertical ? y + h - afterStart : x + w - afterStart
  return (
    <g>
      {vertical ? (
        <>
          <Px x={x} y={y} w={w} h={before} c="ink" />
          <Px x={x} y={afterStart} w={w} h={after} c="ink" />
          <Px x={x + 1} y={y} w={w - 2} h={before - 1} c="wall-top" />
          <Px x={x + 1} y={afterStart + 1} w={w - 2} h={after - 1} c="wall-top" />
        </>
      ) : (
        <>
          <Px x={x} y={y} w={before} h={h} c="ink" />
          <Px x={afterStart} y={y} w={after} h={h} c="ink" />
          <Px x={x} y={y + 1} w={before - 1} h={h - 2} c="wall-top" />
          <Px x={afterStart + 1} y={y + 1} w={after - 1} h={h - 2} c="wall-top" />
        </>
      )}
    </g>
  )
}

function ManagerOffice({ layout }: { layout: FloorLayout }): React.JSX.Element {
  const o = layout.managerOffice
  const glass = o.x + o.w
  return (
    <g>
      <Px x={o.x + 10} y={o.y + 14} w={o.w - 20} h={o.h - 20} c="rug" />
      <Px x={o.x + 12} y={o.y + 16} w={o.w - 24} h={o.h - 24} c="rug-inner" />
      <Px x={o.x + 6} y={12} w={8} h={8} c="ink" />
      <Px x={o.x + 7} y={13} w={6} h={6} c="paper" />
      <Px x={o.x + 9} y={14} w={1} h={3} c="ink" />
      <Px x={o.x + 10} y={16} w={2} h={1} c="ink" />
      <Plant x={o.x + 2} y={o.y + o.h - 16} />
      <Px x={glass} y={o.y} w={3} h={o.h - 22} c="glass" />
      <Px x={glass} y={o.y + o.h - 8} w={3} h={8} c="glass" />
      <Px x={o.x} y={o.y + o.h} w={o.w + 3} h={3} c="glass" />
    </g>
  )
}

function MeetingTable({ rect }: { rect: FloorRect }): React.JSX.Element {
  const seats = Math.max(1, Math.floor((rect.w - 8) / 14))
  return (
    <g>
      {Array.from({ length: seats }, (_, index) => {
        const cx = rect.x + 8 + index * 14
        return (
          <g key={index}>
            <Px x={cx} y={rect.y - 6} w={8} h={6} c="ink" />
            <Px x={cx + 1} y={rect.y - 5} w={6} h={4} c="fabric" />
            <Px x={cx} y={rect.y + rect.h} w={8} h={6} c="ink" />
            <Px x={cx + 1} y={rect.y + rect.h + 1} w={6} h={4} c="fabric" />
          </g>
        )
      })}
      <Px x={rect.x} y={rect.y} w={rect.w} h={rect.h} c="ink" />
      <Px x={rect.x + 1} y={rect.y + 1} w={rect.w - 2} h={rect.h - 4} c="wood" />
      <Px x={rect.x + 1} y={rect.y + rect.h - 3} w={rect.w - 2} h={2} c="wood-dark" />
    </g>
  )
}

function PingPong({ rect }: { rect: FloorRect }): React.JSX.Element {
  const { x, y, w, h } = rect
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

function BreakRoom({ layout }: { layout: FloorLayout }): React.JSX.Element {
  const b = layout.breakRoom
  const couchX = b.x + b.w / 2 - 34
  const couchY = b.y + b.h - 34
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#team-office-tiles)" />
      {/* counter with coffee machine and sink */}
      <Px x={b.x + 2} y={b.y} w={b.w - 36} h={22} c="ink" />
      <Px x={b.x + 3} y={b.y} w={b.w - 38} h={14} c="counter" />
      <Px x={b.x + 3} y={b.y + 14} w={b.w - 38} h={7} c="cabinet" />
      <Px x={b.x + 10} y={b.y - 6} w={11} h={14} c="ink" />
      <Px x={b.x + 11} y={b.y - 5} w={9} h={12} c="metal-dark" />
      <Px x={b.x + 13} y={b.y - 3} w={2} h={2} c="marker-red" />
      <Px x={b.x + 30} y={b.y + 3} w={16} h={8} c="ink" />
      <Px x={b.x + 31} y={b.y + 4} w={14} h={6} c="metal" />
      {/* fridge */}
      <Px x={b.x + b.w - 30} y={b.y - 10} w={24} h={34} c="ink" />
      <Px x={b.x + b.w - 29} y={b.y - 9} w={22} h={32} c="fridge" />
      <Px x={b.x + b.w - 29} y={b.y + 2} w={22} h={1} c="ink" />
      <Px x={b.x + b.w - 11} y={b.y - 5} w={1} h={4} c="ink" />
      {/* water cooler */}
      <Px x={b.x + 4} y={b.y + 52} w={12} h={20} c="ink" />
      <Px x={b.x + 5} y={b.y + 53} w={10} h={7} c="sky" />
      <Px x={b.x + 5} y={b.y + 61} w={10} h={10} c="fridge" />
      {/* bistro table with stools */}
      <Px x={b.x + b.w / 2 - 4} y={b.y + 56} w={8} h={6} c="ink" />
      <Px x={b.x + b.w / 2 + 22} y={b.y + 56} w={8} h={6} c="ink" />
      <Px x={b.x + b.w / 2 - 3} y={b.y + 57} w={6} h={4} c="fabric" />
      <Px x={b.x + b.w / 2 + 23} y={b.y + 57} w={6} h={4} c="fabric" />
      <Px x={b.x + b.w / 2 + 3} y={b.y + 50} w={20} h={16} c="ink" />
      <Px x={b.x + b.w / 2 + 4} y={b.y + 51} w={18} h={12} c="wood" />
      <Px x={b.x + b.w / 2 + 4} y={b.y + 63} w={18} h={2} c="wood-dark" />
      <Px x={b.x + b.w / 2 + 8} y={b.y + 54} w={3} h={3} c="mug" />
      {layout.pingPong ? <PingPong rect={layout.pingPong} /> : null}
      {/* couch and rug */}
      <Px x={couchX - 6} y={couchY - 14} w={80} h={12} c="rug" />
      <Px x={couchX} y={couchY} w={68} h={22} c="ink" />
      <Px x={couchX + 1} y={couchY + 1} w={66} h={8} c="fabric-dark" />
      <Px x={couchX + 1} y={couchY + 9} w={66} h={12} c="fabric" />
      <Px x={couchX + 23} y={couchY + 9} w={1} h={12} c="fabric-dark" />
      <Px x={couchX + 45} y={couchY + 9} w={1} h={12} c="fabric-dark" />
      <Plant x={b.x + 4} y={b.y + b.h - 16} />
      <Plant x={b.x + b.w - 14} y={b.y + b.h - 16} />
    </g>
  )
}

/** Everything that never moves: floor, walls, windows, and the rooms' furniture. */
export function OfficeBackdrop({ layout }: { layout: FloorLayout }): React.JSX.Element {
  const { width, height, breakRoom: b } = layout
  const openPlanRight = layout.breakRoomBeside ? b.x - WALL : width - WALL
  const windows: number[] = []
  const table = layout.meetingTable
  // The whiteboard hangs over the meeting table; without one, windows start inside the lead's office.
  const whiteboardX = table ? table.x + table.w / 2 - 22 : null
  for (
    let x = table
      ? layout.managerOffice.x + layout.managerOffice.w + 8
      : layout.managerOffice.x + 28;
    x + 26 < openPlanRight;
    x += 48
  ) {
    if (whiteboardX === null || x + 26 < whiteboardX - 4 || x > whiteboardX + 48) {
      windows.push(x)
    }
  }
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
      <Px x={WALL} y={WALL} w={width - WALL * 2} h={BACK_WALL - WALL} c="wall-face" />
      <Px x={WALL} y={BACK_WALL - 2} w={width - WALL * 2} h={2} c="wall-trim" />
      {windows.map((x) => (
        <Window key={x} x={x} />
      ))}
      {whiteboardX === null ? null : <Whiteboard x={whiteboardX} />}
      <ManagerOffice layout={layout} />
      {table ? <MeetingTable rect={table} /> : null}
      <BreakRoom layout={layout} />
      {layout.breakRoomBeside ? (
        <Partition
          rect={{ x: b.x - WALL, y: BACK_WALL, w: WALL, h: b.h }}
          door={{ x: b.x - WALL, y: b.y + b.h / 2 - 20, w: WALL, h: 36 }}
        />
      ) : (
        <Partition
          rect={{ x: WALL, y: b.y - WALL, w: width - WALL * 2, h: WALL }}
          door={{ x: width / 2 - 18, y: b.y - WALL, w: 36, h: WALL }}
        />
      )}
      <Plant x={openPlanRight - 14} y={BACK_WALL + 2} />
    </g>
  )
}
