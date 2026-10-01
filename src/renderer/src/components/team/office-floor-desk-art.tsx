import React from 'react'
import { DESK_CELL, type FloorDesk } from './office-floor-plan'
import type { FloorActivity } from './office-floor-state'
import { Px } from './office-floor-sprite'

export type ScreenState = FloorActivity | 'vacant'

// Desk art is 56 units wide; centre it in the wider cell so neighbours get a gap.
const DESK_INSET = (DESK_CELL.w - 56) / 2

/** Monitor contents at a glance: code while working, a question while blocked, a screensaver when idle. */
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
