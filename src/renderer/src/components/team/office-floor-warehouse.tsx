import React from 'react'
import {
  floorRoom,
  type FloorPoint,
  type FloorRect,
  type OfficeFloorPlan
} from './office-floor-plan'
import { Px } from './office-floor-sprite'

/** A box of finished work, as it is stacked in the staging area. */
export const STAGING_BOX = { w: 12, h: 9 }
const STAGING_BOX_PITCH = STAGING_BOX.w + 1
const STAGING_LAYERS = 2
// A rack bay is about this wide; a run is split into equal bays.
const RACK_BAY = 34
const DASH = 6

/**
 * Where boxes go in the staging area, as the top-left corner of each: the floor layer left to
 * right, then the layer on top of it. Stacking in this order never leaves a box hanging in the air.
 */
export function stagingBoxSpots(staging: FloorRect): FloorPoint[] {
  const columns = Math.floor((staging.w - 5) / STAGING_BOX_PITCH)
  const left = staging.x + Math.floor((staging.w - columns * STAGING_BOX_PITCH + 1) / 2)
  return Array.from({ length: columns * STAGING_LAYERS }, (_, index) => ({
    x: left + (index % columns) * STAGING_BOX_PITCH,
    y: staging.y + staging.h - 1 - (Math.floor(index / columns) + 1) * STAGING_BOX.h
  }))
}

export function CardboardBox({
  x,
  y,
  w = STAGING_BOX.w,
  h = STAGING_BOX.h
}: {
  x: number
  y: number
  w?: number
  h?: number
}): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={w} h={h} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={h - 2} c="cardboard" />
      <Px x={x + 1} y={y + h - 3} w={w - 2} h={2} c="cardboard-dark" />
      <Px x={x + Math.floor(w / 2) - 1} y={y + 1} w={2} h={2} c="paper" />
    </g>
  )
}

/** What each of a bay's two shelves holds, as [offset, width, height]; bays cycle through these. */
const RACK_LOADS: readonly (readonly (readonly [number, number, number])[])[] = [
  [
    [3, 12, 8],
    [16, 10, 6]
  ],
  [[7, 15, 8]],
  [
    [3, 9, 7],
    [13, 9, 8],
    [23, 7, 5]
  ]
]

/** Pallet racking seen from the front: uprights, two shelf beams, and the stock on them. */
function Racks({ rect }: { rect: FloorRect }): React.JSX.Element {
  const { x, y, w, h } = rect
  const bays = Math.max(1, Math.round(w / RACK_BAY))
  const bayW = Math.floor((w - 2) / bays)
  const shelves = [y + 10, y + h - 2]
  return (
    <g>
      <Px x={x} y={y} w={bays * bayW + 2} h={h} c="shadow" />
      {Array.from({ length: bays }, (_, bay) =>
        shelves.map((shelfY, level) =>
          RACK_LOADS[(bay + level) % RACK_LOADS.length].map(([dx, bw, bh]) => (
            <CardboardBox
              key={`${bay}:${level}:${dx}`}
              x={x + 2 + bay * bayW + dx}
              y={shelfY - bh}
              w={bw}
              h={bh}
            />
          ))
        )
      )}
      {shelves.map((shelfY) => (
        <g key={shelfY}>
          <Px x={x} y={shelfY} w={bays * bayW + 2} h={2} c="ink" />
          <Px x={x} y={shelfY} w={bays * bayW + 2} h={1} c="marking" />
        </g>
      ))}
      {Array.from({ length: bays + 1 }, (_, post) => (
        <Px key={post} x={x + post * bayW} y={y} w={2} h={h} c="metal-dark" />
      ))}
    </g>
  )
}

/** Stretches of the warehouse's back wall between its doors that are long enough for a rack. */
function rackRuns(plan: OfficeFloorPlan): FloorRect[] {
  const room = floorRoom(plan, 'warehouse')
  const { shelf } = plan.fixtures
  if (!room) {
    return []
  }
  const doors = room.doors.map((door) => door.rect).sort((a, b) => a.x - b.x)
  const stops = [...doors.map((door) => door.x - 8), room.rect.x + room.rect.w - 8]
  const starts = [shelf.x, ...doors.map((door) => door.x + door.w + 8)]
  return starts
    .map((start, index) => ({ x: start, y: shelf.y, w: stops[index] - start, h: shelf.h }))
    .filter((run) => run.w >= RACK_BAY)
}

/** A dashed outline painted on the floor. */
function FloorMarking({ rect }: { rect: FloorRect }): React.JSX.Element {
  const { x, y, w, h } = rect
  const across = Array.from({ length: Math.ceil(w / (DASH * 2)) }, (_, dash) => dash * DASH * 2)
  const down = Array.from({ length: Math.ceil(h / (DASH * 2)) }, (_, dash) => dash * DASH * 2)
  return (
    <g>
      {across.map((dx) => (
        <g key={dx}>
          <Px x={x + dx} y={y} w={Math.min(DASH, w - dx)} h={1} c="marking" />
          <Px x={x + dx} y={y + h - 1} w={Math.min(DASH, w - dx)} h={1} c="marking" />
        </g>
      ))}
      {down.map((dy) => (
        <g key={dy}>
          <Px x={x} y={y + dy} w={1} h={Math.min(DASH, h - dy)} c="marking" />
          <Px x={x + w - 1} y={y + dy} w={1} h={Math.min(DASH, h - dy)} c="marking" />
        </g>
      ))}
    </g>
  )
}

/** The roller door in the bottom wall, its bumpers, and the striped plate in front of it. */
function Dock({ rect }: { rect: FloorRect }): React.JSX.Element {
  const { x, y, w, h } = rect
  const stripes = Array.from({ length: Math.floor((w - 4) / 8) }, (_, stripe) => stripe * 8)
  return (
    <g>
      <Px x={x + 2} y={y - 6} w={w - 4} h={6} c="ink" />
      <Px x={x + 3} y={y - 5} w={w - 6} h={5} c="metal-dark" />
      {stripes.map((dx) => (
        <Px key={dx} x={x + 4 + dx} y={y - 5} w={4} h={2} c="marking" />
      ))}
      <Px x={x} y={y - 1} w={w} h={h + 1} c="ink" />
      <Px x={x + 1} y={y} w={w - 2} h={2} c="metal" />
      <Px x={x + 1} y={y + 3} w={w - 2} h={2} c="metal" />
      <Px x={x + 1} y={y + 6} w={w - 2} h={1} c="metal" />
      <Px x={x - 4} y={y - 8} w={4} h={8} c="ink" />
      <Px x={x - 3} y={y - 7} w={2} h={6} c="marking" />
      <Px x={x + w} y={y - 8} w={4} h={8} c="ink" />
      <Px x={x + w + 1} y={y - 7} w={2} h={6} c="marking" />
    </g>
  )
}

/** A pallet with a couple of boxes waiting on it; 24 wide, 14 tall. */
function Pallet({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y + 10} w={24} h={4} c="ink" />
      <Px x={x + 1} y={y + 11} w={22} h={1} c="wood-light" />
      <Px x={x + 3} y={y + 12} w={4} h={2} c="wood" />
      <Px x={x + 10} y={y + 12} w={4} h={2} c="wood" />
      <Px x={x + 17} y={y + 12} w={4} h={2} c="wood" />
      <CardboardBox x={x + 2} y={y + 2} w={11} h={8} />
      <CardboardBox x={x + 13} y={y} w={9} h={10} />
    </g>
  )
}

/**
 * The warehouse: racks of stock along the back, the loading dock, and beside it a marked staging
 * area left empty for finished work. Boxes there are placed with `stagingBoxSpots`.
 */
export function Warehouse({ plan }: { plan: OfficeFloorPlan }): React.JSX.Element | null {
  const room = floorRoom(plan, 'warehouse')?.rect
  if (!room) {
    return null
  }
  const { staging, dock } = plan.fixtures
  return (
    <g>
      {rackRuns(plan).map((run) => (
        <Racks key={run.x} rect={run} />
      ))}
      <FloorMarking rect={staging} />
      {staging.x - room.x >= 44 ? <Pallet x={room.x + 8} y={room.y + room.h - 17} /> : null}
      <Dock rect={dock} />
    </g>
  )
}
