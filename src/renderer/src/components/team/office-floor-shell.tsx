import React from 'react'
import {
  BACK_WALL,
  WALL,
  type FloorDoor,
  type FloorRect,
  type FloorRoomId,
  type FloorWall,
  type OfficeFloorPlan
} from './office-floor-plan'
import { Px } from './office-floor-sprite'

const WINDOW = { w: 26, h: 18, y: WALL + 7 }
const WINDOW_PITCH = 38
// How far a glass wall's pane shows above the wall line, and the shortest wall that has one.
const GLASS_RISE = 10
const GLASS_PANE_MIN = 20
const DOOR_LEAF = 14
const HINGED_ROOMS: ReadonlySet<FloorRoomId> = new Set(['manager', 'conference', 'kitchen'])

/** Each room's floor is its own material, which is most of what tells the rooms apart. */
const ROOM_FLOOR: Record<FloorRoomId, string> = {
  manager: 'team-office-planks',
  conference: 'team-office-meeting',
  kitchen: 'team-office-tiles',
  reception: 'team-office-lobby',
  bullpen: 'team-office-carpet',
  annex: 'team-office-carpet',
  warehouse: 'team-office-concrete'
}

function FloorPatterns(): React.JSX.Element {
  return (
    <defs>
      <pattern id="team-office-carpet" width={32} height={32} patternUnits="userSpaceOnUse">
        <Px x={0} y={0} w={32} h={32} c="floor" />
        <Px x={0} y={31} w={32} h={1} c="floor-line" />
        <Px x={31} y={0} w={1} h={32} c="floor-line" />
        <Px x={6} y={8} c="floor-line" />
        <Px x={20} y={4} c="floor-line" />
        <Px x={12} y={22} c="floor-line" />
        <Px x={26} y={16} c="floor-line" />
      </pattern>
      <pattern id="team-office-meeting" width={12} height={12} patternUnits="userSpaceOnUse">
        <Px x={0} y={0} w={12} h={12} c="floor-meeting" />
        <Px x={2} y={2} w={2} h={1} c="floor-meeting-line" />
        <Px x={8} y={8} w={2} h={1} c="floor-meeting-line" />
      </pattern>
      <pattern id="team-office-planks" width={48} height={18} patternUnits="userSpaceOnUse">
        <Px x={0} y={0} w={48} h={18} c="boards" />
        <Px x={0} y={5} w={48} h={1} c="boards-line" />
        <Px x={0} y={11} w={48} h={1} c="boards-line" />
        <Px x={0} y={17} w={48} h={1} c="boards-line" />
        <Px x={13} y={0} w={1} h={5} c="boards-line" />
        <Px x={37} y={6} w={1} h={5} c="boards-line" />
        <Px x={25} y={12} w={1} h={5} c="boards-line" />
      </pattern>
      <pattern id="team-office-lobby" width={24} height={24} patternUnits="userSpaceOnUse">
        <Px x={0} y={0} w={24} h={24} c="lobby" />
        <Px x={0} y={23} w={24} h={1} c="lobby-line" />
        <Px x={23} y={0} w={1} h={24} c="lobby-line" />
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
        <Px x={9} y={12} w={2} h={1} c="concrete-line" />
        <Px x={22} y={24} w={1} h={2} c="concrete-line" />
      </pattern>
    </defs>
  )
}

function FloorFill({ rect, pattern }: { rect: FloorRect; pattern: string }): React.JSX.Element {
  return <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={`url(#${pattern})`} />
}

function Window({ x }: { x: number }): React.JSX.Element {
  const { y, w, h } = WINDOW
  return (
    <g>
      <Px x={x} y={y} w={w} h={h} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={h - 2} c="sky" />
      <Px x={x + 3} y={y + 3} w={5} h={2} c="sky-glint" />
      <Px x={x + 3} y={y + 5} w={2} h={2} c="sky-glint" />
      <Px x={x + w / 2 - 1} y={y + 1} w={2} h={h - 2} c="ink" />
      <Px x={x + 1} y={y + 8} w={w - 2} h={1} c="ink" />
      <Px x={x - 1} y={y + h - 1} w={w + 2} h={2} c="wall-trim" />
    </g>
  )
}

/** As many windows as fit between `from` and `to`, centred in that stretch of wall. */
function windowsBetween(from: number, to: number): number[] {
  const count = Math.floor((to - from - WINDOW.w) / WINDOW_PITCH) + 1
  if (count <= 0) {
    return []
  }
  const start = Math.round((from + to - (count - 1) * WINDOW_PITCH - WINDOW.w) / 2)
  return Array.from({ length: count }, (_, index) => start + index * WINDOW_PITCH)
}

/** Windows go where the back wall is bare: either side of the whiteboard, and in the office. */
function windowXs(plan: OfficeFloorPlan): number[] {
  const board = plan.fixtures.whiteboard
  return plan.rooms.flatMap(({ id, rect }) => {
    if (rect.y !== BACK_WALL) {
      return []
    }
    if (id === 'conference') {
      return [
        ...windowsBetween(rect.x + 8, board.x - 20),
        ...windowsBetween(board.x + board.w + 12, rect.x + rect.w - 8)
      ]
    }
    return id === 'manager' ? windowsBetween(rect.x + 24, rect.x + rect.w - 8) : []
  })
}

function BackWall({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element {
  const w = plan.width - WALL * 2
  return (
    <g>
      <Px x={WALL} y={WALL} w={w} h={BACK_WALL - WALL} c="wall-face" />
      <Px x={WALL} y={WALL} w={w} h={1} c="wall-trim" />
      <Px x={WALL} y={BACK_WALL - 2} w={w} h={2} c="wall-trim" />
      {/* A partition between two back rooms carries on up the wall as a pilaster. */}
      {plan.walls
        .filter(({ kind, rect }) => kind !== 'shell' && rect.y === BACK_WALL && rect.h > rect.w)
        .map(({ rect }) => (
          <Px
            key={rect.x}
            x={rect.x}
            y={WALL + 1}
            w={rect.w}
            h={BACK_WALL - WALL - 1}
            c="wall-trim"
          />
        ))}
      {windowXs(plan).map((x) => (
        <Window key={x} x={x} />
      ))}
    </g>
  )
}

/** The building: outer walls, each room's floor, and the back wall with its windows. */
export function OfficeShell({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element {
  const { width, height } = plan
  const interior = { x: WALL, y: BACK_WALL, w: width - WALL * 2, h: height - BACK_WALL - WALL }
  return (
    <g>
      <FloorPatterns />
      <Px x={0} y={0} w={width} h={height} c="ink" />
      <Px x={1} y={1} w={width - 2} h={height - 2} c="wall-top" />
      <Px x={interior.x - 1} y={WALL - 1} w={interior.w + 2} h={height - WALL * 2 + 2} c="ink" />
      <FloorFill rect={interior} pattern="team-office-carpet" />
      {plan.rooms.map(({ id, rect }) => (
        <FloorFill key={id} rect={rect} pattern={ROOM_FLOOR[id]} />
      ))}
      <BackWall plan={plan} />
    </g>
  )
}

function across({ w, h }: FloorRect): boolean {
  return w >= h
}

/** Posts along a glass wall, as offsets from its start: both ends, and one every few units. */
function glassPosts(length: number): number[] {
  const spans = Math.max(1, Math.round(length / 22))
  const posts = Array.from({ length: spans + 1 }, (_, post) =>
    Math.max(0, Math.min(length - 2, Math.round((post * length) / spans)))
  )
  return [...new Set(posts)]
}

function Wall({ wall }: { wall: FloorWall }): React.JSX.Element {
  const { x, y, w, h } = wall.rect
  if (wall.kind !== 'glass') {
    return (
      <g>
        <Px x={x} y={y} w={w} h={h} c="ink" />
        <Px x={x + 1} y={y + 1} w={w - 2} h={h - 2} c="wall-top" />
      </g>
    )
  }
  const flat = across(wall.rect)
  // The pane rises from a wall that runs across, and what is behind it shows through. A stub
  // beside a door is all frame.
  const pane = flat && w >= GLASS_PANE_MIN
  return (
    <g>
      {pane ? <Px x={x} y={y - GLASS_RISE} w={w} h={GLASS_RISE} c="glass" /> : null}
      {pane ? <Px x={x} y={y - GLASS_RISE} w={w} h={1} c="glass" /> : null}
      <Px x={x} y={y} w={w} h={h} c="metal-dark" />
      {flat ? (
        <Px x={x} y={y + 1} w={w} h={h - 2} c="glass-pane" />
      ) : (
        <Px x={x + 1} y={y} w={w - 2} h={h} c="glass-pane" />
      )}
      {glassPosts(flat ? w : h).map((post) =>
        flat ? (
          <g key={post}>
            {pane ? <Px x={x + post} y={y - GLASS_RISE} w={2} h={GLASS_RISE} c="metal" /> : null}
            <Px x={x + post} y={y} w={2} h={h} c="ink" />
          </g>
        ) : (
          <Px key={post} x={x} y={y + post} w={w} h={2} c="ink" />
        )
      )}
    </g>
  )
}

/**
 * A threshold across the opening. A back room's door also gets its leaf, standing open into the
 * room; the openings off the hall and into the warehouse are archways.
 */
function Doorway({ door }: { door: FloorDoor }): React.JSX.Element {
  const { x, y, w, h } = door.rect
  if (!across(door.rect)) {
    return <Px x={x + 1} y={y} w={w - 2} h={h} c="floor-line" />
  }
  const hinged = door.rooms.some((room) => HINGED_ROOMS.has(room))
  return (
    <g>
      <Px x={x} y={y + 1} w={w} h={h - 2} c="floor-line" />
      {hinged ? (
        <>
          <Px x={x - 1} y={y - DOOR_LEAF} w={4} h={DOOR_LEAF + 1} c="ink" />
          <Px
            x={x}
            y={y - DOOR_LEAF + 1}
            w={2}
            h={DOOR_LEAF - 1}
            c={door.rooms.includes('manager') ? 'glass-pane' : 'wood'}
          />
          <Px x={x + 1} y={y - 4} w={1} h={2} c="metal" />
        </>
      ) : null}
    </g>
  )
}

/** The walls between rooms and the doors through them; drawn over the rooms' floors and rugs. */
export function OfficeWalls({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element {
  return (
    <g>
      {plan.walls
        .filter((wall) => wall.kind !== 'shell')
        .map((wall) => (
          <Wall key={Object.values(wall.rect).join(':')} wall={wall} />
        ))}
      {plan.doors.map((door) => (
        <Doorway key={door.id} door={door} />
      ))}
    </g>
  )
}
