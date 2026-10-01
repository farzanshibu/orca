import React from 'react'
import {
  ChairBack,
  ChairFront,
  ChairSeat,
  Keyboard,
  MonitorBack,
  MonitorFront,
  Mug,
  PaperSheet,
  type ScreenState
} from './office-floor-desk-art'
import { POD_BLOCK, type FloorDesk, type FloorPod, type FloorPoint } from './office-floor-plan'
import { Px } from './office-floor-sprite'

// A monitor stands at the far side of its desk, so it rises past the edge of the desk next to it.
const SCREEN_RISE = 4
// The back of a monitor is kept low, so the face behind it shows down to the shoulders.
const BACK_RISE = 2
const BLOCK_H = POD_BLOCK.bottom - POD_BLOCK.top
// The front panel under the block's near edge.
const BLOCK_FRONT = 4

/**
 * The desk block a pod's two rows share: one surface, a low divider where the facing desks meet,
 * and a seam between neighbours. Everything on it belongs to a desk and comes from `DeskSetup`.
 */
export function PodBlock({ pod }: { pod: FloorPod }): React.JSX.Element {
  const x = pod.rect.x + 1
  const w = pod.rect.w - 2
  const y = pod.rect.y + POD_BLOCK.top
  const divider = pod.rect.y + POD_BLOCK.middle - 1
  const surface = BLOCK_H - BLOCK_FRONT - 1
  return (
    <g>
      <Px x={x + 2} y={y + BLOCK_H} w={w - 4} h={2} c="shadow" />
      <Px x={x} y={y} w={w} h={BLOCK_H} c="ink" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={surface} c="wood" />
      <Px x={x + 1} y={y + 1} w={w - 2} h={1} c="wood-light" />
      <Px x={x + 1} y={y + 1 + surface} w={w - 2} h={BLOCK_FRONT - 1} c="wood-dark" />
      <Px x={x + w / 2} y={y + 1} w={1} h={surface} c="wood-dark" />
      <Px x={x + 1} y={divider} w={w - 2} h={3} c="ink" />
      <Px x={x + 1} y={divider} w={w - 2} h={1} c="metal" />
      <Px x={x + 1} y={divider + 1} w={w - 2} h={1} c="metal-dark" />
    </g>
  )
}

/**
 * The top-left corner of the sheet of paper beside a desk's monitor: the one spot on a desk that
 * is free on both kinds of desk, so whatever marks a desk's current ticket goes here.
 */
export function deskPaperSpot({ seat, top, facing }: FloorDesk): FloorPoint {
  return { x: seat.x - 23, y: top.y + (facing === 'viewer' ? 4 : 6) }
}

/**
 * What is on and at one desk: monitor, clutter and chair. A viewer-facing desk shows the back of
 * its monitor, an away-facing one shows the screen. `occupied` leaves out the chair parts a sitter
 * would hide.
 */
export function DeskSetup({
  desk,
  state,
  occupied
}: {
  desk: FloorDesk
  state: ScreenState
  occupied: boolean
}): React.JSX.Element {
  const { seat, top } = desk
  const paper = deskPaperSpot(desk)
  if (desk.facing === 'viewer') {
    return (
      <g>
        <ChairFront at={seat} vacant={!occupied} />
        <PaperSheet x={paper.x} y={paper.y} />
        <Mug x={seat.x + 16} y={top.y + 5} />
        <MonitorBack x={seat.x} y={top.y - BACK_RISE} state={state} />
      </g>
    )
  }
  return (
    <g>
      <PaperSheet x={paper.x} y={paper.y} />
      <Mug x={seat.x + 16} y={top.y + 8} />
      <MonitorFront x={seat.x} y={top.y - SCREEN_RISE} state={state} />
      <Keyboard x={seat.x} y={top.y + 13} />
      {occupied ? null : (
        <>
          <ChairSeat at={seat} />
          <ChairBack at={seat} />
        </>
      )}
    </g>
  )
}

/**
 * The part of a desk that stands between the viewer and whoever sits at it: the monitor of a
 * viewer-facing desk. An away-facing sitter is only behind their own chair.
 */
export function DeskForeground({
  desk,
  state
}: {
  desk: FloorDesk
  state: ScreenState
}): React.JSX.Element | null {
  return desk.facing === 'viewer' ? (
    <MonitorBack x={desk.seat.x} y={desk.top.y - BACK_RISE} state={state} />
  ) : null
}
