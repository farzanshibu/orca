import React from 'react'
import type { Paint } from './office-floor-palette'
import type { FloorPoint } from './office-floor-plan'
import type { FloorActivity } from './office-floor-state'
import { Px } from './office-floor-sprite'

export type ScreenState = FloorActivity | 'vacant'

/** A monitor's outer size; its screen is one unit in from the top and sides. */
export const MONITOR = { w: 22, h: 14 }
const SCREEN = { w: MONITOR.w - 2, h: 11 }

/** Monitor contents at a glance: code while working, a question while blocked, a screensaver when idle. */
function Screen({ x, y, state }: { x: number; y: number; state: ScreenState }): React.JSX.Element {
  if (state === 'working') {
    return (
      <g>
        <Px x={x} y={y} w={SCREEN.w} h={SCREEN.h} c="screen-work" />
        <Px x={x + 2} y={y + 2} w={8} h={1} c="screen-line" />
        <Px x={x + 4} y={y + 4} w={11} h={1} c="screen-line" />
        <Px x={x + 4} y={y + 6} w={6} h={1} c="screen-line" />
        <Px x={x + 2} y={y + 8} w={9} h={1} c="screen-line" />
        <g className="team-office-cursor">
          <Px x={x + 11} y={y + 6} w={2} h={1} c="screen-line" />
        </g>
      </g>
    )
  }
  if (state === 'waiting') {
    return (
      <g className="team-office-blink">
        <Px x={x} y={y} w={SCREEN.w} h={SCREEN.h} c="screen-wait" />
        <Px x={x + 8} y={y + 2} w={4} h={1} c="ink" />
        <Px x={x + 11} y={y + 3} w={1} h={2} c="ink" />
        <Px x={x + 9} y={y + 5} w={2} h={1} c="ink" />
        <Px x={x + 9} y={y + 7} w={2} h={2} c="ink" />
      </g>
    )
  }
  if (state === 'idle') {
    return (
      <g>
        <Px x={x} y={y} w={SCREEN.w} h={SCREEN.h} c="screen-idle" />
        <Px x={x + 6} y={y + 3} w={4} h={4} c="screen-line" />
        <Px x={x + 13} y={y + 7} w={2} h={2} c="screen-line" />
      </g>
    )
  }
  return (
    <g>
      <Px x={x} y={y} w={SCREEN.w} h={SCREEN.h} c="screen-off" />
      <Px x={x + 2} y={y + 2} w={3} h={1} c="metal-dark" />
    </g>
  )
}

function MonitorStand({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x - 2} y={y} w={4} h={2} c="ink" />
      <Px x={x - 6} y={y + 2} w={12} h={1} c="ink" />
    </g>
  )
}

/** A monitor seen from its user's side. `x` is its centre, `y` its top edge. */
export function MonitorFront({
  x,
  y,
  state
}: {
  x: number
  y: number
  state: ScreenState
}): React.JSX.Element {
  const left = x - MONITOR.w / 2
  return (
    <g>
      <Px x={left} y={y} w={MONITOR.w} h={MONITOR.h} c="ink" />
      <Screen x={left + 1} y={y + 1} state={state} />
      <Px x={x - 1} y={y + MONITOR.h - 2} w={2} h={1} c="metal-dark" />
      <MonitorStand x={x} y={y + MONITOR.h} />
    </g>
  )
}

const BACK_GLOW: Partial<Record<ScreenState, Paint>> = {
  working: 'screen-work',
  waiting: 'screen-wait',
  idle: 'screen-idle'
}

/**
 * A monitor seen from behind. Its screen faces the person, so what it shows reaches the viewer
 * only as the light spilling over its top edge: lit while working, blinking while blocked.
 */
export function MonitorBack({
  x,
  y,
  state
}: {
  x: number
  y: number
  state: ScreenState
}): React.JSX.Element {
  const left = x - MONITOR.w / 2
  const glow = BACK_GLOW[state]
  const light = glow ? (
    <>
      <Px x={left + 1} y={y - 1} w={MONITOR.w - 2} h={1} c={glow} />
      <Px x={left} y={y} w={MONITOR.w} h={1} c={glow} />
    </>
  ) : null
  return (
    <g>
      <Px x={left} y={y} w={MONITOR.w} h={MONITOR.h} c="ink" />
      <Px x={left + 1} y={y + 1} w={MONITOR.w - 2} h={MONITOR.h - 2} c="metal-dark" />
      <Px x={left + 1} y={y + 1} w={MONITOR.w - 2} h={1} c="metal" />
      <Px x={x - 4} y={y + 5} w={8} h={5} c="ink" />
      <Px x={x - 3} y={y + 6} w={6} h={3} c="metal" />
      <Px x={left + 3} y={y + 4} w={3} h={1} c="ink" />
      <Px x={left + 3} y={y + 6} w={3} h={1} c="ink" />
      <Px x={left + MONITOR.w - 6} y={y + 4} w={3} h={1} c="ink" />
      <Px x={left + MONITOR.w - 6} y={y + 6} w={3} h={1} c="ink" />
      {state === 'waiting' ? <g className="team-office-blink">{light}</g> : light}
      <MonitorStand x={x} y={y + MONITOR.h} />
    </g>
  )
}

export function Keyboard({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x - 8} y={y} w={16} h={3} c="ink" />
      <Px x={x - 7} y={y + 1} w={14} h={1} c="metal" />
    </g>
  )
}

export function PaperSheet({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={7} h={8} c="paper" />
      <Px x={x + 1} y={y + 2} w={5} h={1} c="paper-line" />
      <Px x={x + 1} y={y + 4} w={4} h={1} c="paper-line" />
      <Px x={x + 1} y={y + 6} w={5} h={1} c="paper-line" />
    </g>
  )
}

export function Mug({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={5} h={5} c="ink" />
      <Px x={x + 1} y={y + 1} w={3} h={3} c="mug" />
      <Px x={x + 5} y={y + 1} w={1} h={3} c="ink" />
    </g>
  )
}

/**
 * The back of a chair whose sitter faces away. It stands between the viewer and the sitter, so it
 * is drawn after them. `at` is the seat: where the sitter's feet rest.
 */
export function ChairBack({ at }: { at: FloorPoint }): React.JSX.Element {
  const { x, y } = at
  return (
    <g>
      <Px x={x - 8} y={y - 6} w={16} h={7} c="ink" />
      <Px x={x - 7} y={y - 5} w={14} h={5} c="chair" />
      <Px x={x - 7} y={y - 5} w={14} h={1} c="chair-light" />
      <Px x={x - 1} y={y + 1} w={2} h={2} c="ink" />
      <Px x={x - 5} y={y + 3} w={10} h={1} c="ink" />
    </g>
  )
}

/** The cushion of that chair; a sitter hides it, so it is only drawn while the chair is empty. */
export function ChairSeat({ at }: { at: FloorPoint }): React.JSX.Element {
  const { x, y } = at
  return (
    <g>
      <Px x={x - 7} y={y - 16} w={14} h={11} c="ink" />
      <Px x={x - 6} y={y - 15} w={12} h={9} c="chair-dark" />
      <Px x={x - 9} y={y - 14} w={2} h={6} c="ink" />
      <Px x={x + 7} y={y - 14} w={2} h={6} c="ink" />
    </g>
  )
}

/**
 * A chair whose sitter faces the viewer: its back rises behind them and the furniture in front
 * hides the rest, so it is drawn before both. `at` is the seat, on the furniture's far edge.
 */
export function ChairFront({ at, vacant }: { at: FloorPoint; vacant: boolean }): React.JSX.Element {
  const { x, y } = at
  return (
    <g>
      <Px x={x - 9} y={y - 14} w={18} h={14} c="ink" />
      <Px x={x - 8} y={y - 13} w={16} h={13} c="chair" />
      <Px x={x - 8} y={y - 13} w={16} h={1} c="chair-light" />
      <Px x={x - 11} y={y - 6} w={2} h={6} c="ink" />
      <Px x={x + 9} y={y - 6} w={2} h={6} c="ink" />
      {vacant ? <Px x={x - 7} y={y - 4} w={14} h={4} c="chair-dark" /> : null}
    </g>
  )
}
