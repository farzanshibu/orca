import React from 'react'
import { Mug } from './office-floor-desk-art'
import { WallClock, WaterCooler } from './office-floor-furnishings'
import { BACK_WALL, floorRoom, type OfficeFloorPlan } from './office-floor-plan'
import { Px } from './office-floor-sprite'

const FRIDGE_W = 24
const CABINET_DOOR = 14

/** Cupboards on the wall above the counter; only where the kitchen backs onto the tall back wall. */
function WallCabinets({ x, y, w }: { x: number; y: number; w: number }): React.JSX.Element {
  const doors = Math.floor((w - 2) / CABINET_DOOR)
  return (
    <g>
      <Px x={x} y={y} w={w} h={14} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={12} c="cabinet" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={1} c="wood" />
      {Array.from({ length: doors }, (_, door) => (
        <g key={door}>
          <Px x={x + (door + 1) * CABINET_DOOR} y={y + 1} w={1} h={12} c="ink" />
          <Px x={x + (door + 1) * CABINET_DOOR - 4} y={y + 9} w={2} h={1} c="metal" />
        </g>
      ))}
    </g>
  )
}

function CoffeeMachine({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={12} h={15} c="ink" />
      <Px x={x + 1} y={y + 1} w={10} h={13} c="metal-dark" />
      <Px x={x + 1} y={y + 1} w={10} h={3} c="metal" />
      <Px x={x + 8} y={y + 2} w={2} h={1} c="marker-red" />
      <Px x={x + 3} y={y + 6} w={6} h={7} c="ink" />
      <Px x={x + 4} y={y + 8} w={4} h={4} c="glass-pane" />
      <Px x={x + 4} y={y + 10} w={4} h={2} c="wood-dark" />
    </g>
  )
}

function Sink({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={16} h={8} c="ink" />
      <Px x={x + 1} y={y + 1} w={14} h={6} c="metal" />
      <Px x={x + 3} y={y + 2} w={10} h={4} c="metal-dark" />
      <Px x={x + 7} y={y - 3} w={2} h={5} c="ink" />
      <Px x={x + 7} y={y - 3} w={4} h={1} c="ink" />
    </g>
  )
}

function Microwave({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={18} h={11} c="ink" />
      <Px x={x + 1} y={y + 1} w={16} h={9} c="fridge" />
      <Px x={x + 2} y={y + 2} w={10} h={7} c="screen-off" />
      <Px x={x + 14} y={y + 3} w={2} h={1} c="marker-green" />
      <Px x={x + 14} y={y + 6} w={2} h={2} c="metal-dark" />
    </g>
  )
}

function Fridge({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={FRIDGE_W} h={34} c="ink" />
      <Px x={x + 1} y={y + 1} w={FRIDGE_W - 2} h={32} c="fridge" />
      <Px x={x + 1} y={y + 1} w={2} h={32} c="metal" />
      <Px x={x + 1} y={y + 12} w={FRIDGE_W - 2} h={1} c="ink" />
      <Px x={x + FRIDGE_W - 5} y={y + 5} w={1} h={5} c="ink" />
      <Px x={x + FRIDGE_W - 5} y={y + 15} w={1} h={8} c="ink" />
      <Px x={x + 7} y={y + 16} w={5} h={5} c="paper" />
      <Px x={x + 9} y={y + 15} w={1} h={2} c="marker-red" />
      <Px x={x + 6} y={y + 24} w={3} h={3} c="marking" />
    </g>
  )
}

/** A high table with two stools; 30 wide, 16 tall. */
function BistroTable({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y + 6} w={7} h={7} c="ink" />
      <Px x={x + 1} y={y + 7} w={5} h={5} c="chair" />
      <Px x={x + 23} y={y + 6} w={7} h={7} c="ink" />
      <Px x={x + 24} y={y + 7} w={5} h={5} c="chair" />
      <Px x={x + 9} y={y + 14} w={12} h={2} c="shadow" />
      <Px x={x + 8} y={y} w={14} h={12} c="ink" />
      <Px x={x + 7} y={y + 2} w={16} h={8} c="ink" />
      <Px x={x + 9} y={y + 1} w={12} h={10} c="wood-light" />
      <Px x={x + 8} y={y + 3} w={14} h={6} c="wood-light" />
      <Px x={x + 14} y={y + 12} w={2} h={3} c="ink" />
      <Mug x={x + 12} y={y + 3} />
    </g>
  )
}

/**
 * The kitchen: a counter with the coffee machine, a sink and a microwave where there is room, and
 * the fridge at its far end. A kitchen nobody walks straight through also gets a water cooler by
 * the door and, where it is wide enough, a table to stand at.
 */
export function Kitchen({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element | null {
  const room = floorRoom(plan, 'kitchen')
  if (!room) {
    return null
  }
  const { rect } = room
  const counter = plan.fixtures.kitchenCounter
  const { x, y } = counter
  const run = counter.w - FRIDGE_W - 2
  const onBackWall = rect.y === BACK_WALL
  const doorOnLeft = counter.x - rect.x > rect.x + rect.w - counter.x - counter.w
  // A door in the top wall makes the door side a way through to the room above.
  const passage = room.doors.some((door) => door.rect.y < rect.y)
  return (
    <g>
      {onBackWall ? (
        <>
          <WallCabinets x={x} y={y - 31} w={run} />
          <WallClock x={doorOnLeft ? rect.x + 9 : rect.x + rect.w - 18} y={y - 30} />
        </>
      ) : null}
      {passage ? null : (
        <WaterCooler x={doorOnLeft ? rect.x + 14 : x + counter.w + 8} y={rect.y - 2} />
      )}
      {!passage && rect.w >= 120 ? (
        <BistroTable x={doorOnLeft ? rect.x + rect.w - 38 : rect.x + 8} y={rect.y + 36} />
      ) : null}
      <Px x={x + 2} y={y + 22} w={run - 4} h={2} c="shadow" />
      <Px x={x} y={y} w={run} h={22} c="ink" />
      <Px x={x + 1} y={y} w={run - 2} h={14} c="counter" />
      <Px x={x + 1} y={y + 13} w={run - 2} h={1} c="metal-dark" />
      <Px x={x + 1} y={y + 14} w={run - 2} h={7} c="cabinet" />
      {Array.from({ length: Math.floor((run - 2) / CABINET_DOOR) }, (_, door) => (
        <g key={door}>
          <Px x={x + (door + 1) * CABINET_DOOR} y={y + 14} w={1} h={7} c="ink" />
          <Px x={x + (door + 1) * CABINET_DOOR - 4} y={y + 16} w={2} h={1} c="metal" />
        </g>
      ))}
      <CoffeeMachine x={x + 3} y={y - 7} />
      {run >= 40 ? <Sink x={x + 20} y={y + 3} /> : null}
      {run >= 64 ? <Microwave x={x + 42} y={y - 2} /> : null}
      {run >= 84 ? <Mug x={x + 66} y={y + 5} /> : null}
      <Fridge x={x + counter.w - FRIDGE_W} y={y - 10} />
    </g>
  )
}
