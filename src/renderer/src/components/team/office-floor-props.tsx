import React from 'react'
import type { FloorCarry } from './office-floor-events'
import type { Paint } from './office-floor-palette'
import type { FloorPoint } from './office-floor-plan'
import { FIGURE, Px } from './office-floor-sprite'
import type { SpriteFrame } from './office-walk-animation'

/** The box a character away from its desk is drawn in; its origin is where the feet rest. */
export const ACTOR_FRAME: SpriteFrame = { w: 30, h: 32, origin: { x: 15, y: 27 } }
export const ENVELOPE_FRAME: SpriteFrame = { w: 12, h: 9, origin: { x: 6, y: 5 } }
export const NOTE_FRAME: SpriteFrame = { w: 8, h: 8, origin: { x: 4, y: 7 } }
export const BOX_FRAME: SpriteFrame = { w: 14, h: 11, origin: { x: 7, y: 10 } }

// The kind of mail shows in the colour of the seal; anything unknown is plain paper.
const SEAL_PAINTS: Partial<Record<string, Paint>> = {
  handoff: 'marking',
  worker_done: 'marker-green',
  merge_ready: 'marker-green',
  status: 'marker-blue',
  escalation: 'marker-red'
}

function sealPaint(tint: string | null): Paint {
  return SEAL_PAINTS[tint ?? ''] ?? 'paper-line'
}

/** A letter, 10 by 7, with its top-left corner at `x`,`y`. */
export function Envelope({
  x,
  y,
  tint
}: {
  x: number
  y: number
  tint: string | null
}): React.JSX.Element {
  const seal = sealPaint(tint)
  return (
    <g>
      <Px x={x} y={y} w={10} h={7} c="ink" />
      <Px x={x + 1} y={y + 1} w={8} h={5} c="paper" />
      <Px x={x + 1} y={y + 1} w={8} h={1} c={seal} />
      <Px x={x + 3} y={y + 2} w={4} h={1} c={seal} />
      <Px x={x + 4} y={y + 3} w={2} h={1} c={seal} />
    </g>
  )
}

function Folder({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={5} h={2} c="ink" />
      <Px x={x + 1} y={y + 1} w={3} h={1} c="marking" />
      <Px x={x} y={y + 1} w={10} h={7} c="ink" />
      <Px x={x + 1} y={y + 2} w={8} h={5} c="marking" />
      <Px x={x + 2} y={y + 3} w={6} h={1} c="paper" />
    </g>
  )
}

/** A sheet for the human, 6 by 7. */
export function Note({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={6} h={7} c="ink" />
      <Px x={x + 1} y={y + 1} w={4} h={5} c="paper" />
      <Px x={x + 1} y={y + 2} w={3} h={1} c="marker-red" />
      <Px x={x + 1} y={y + 4} w={4} h={1} c="paper-line" />
    </g>
  )
}

function Ticket({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={8} h={6} c="ink" />
      <Px x={x + 1} y={y + 1} w={6} h={4} c="paper" />
      <Px x={x + 1} y={y + 1} w={6} h={1} c="marker-blue" />
      <Px x={x + 2} y={y + 3} w={4} h={1} c="paper-line" />
    </g>
  )
}

/** A box of finished work, 12 by 9. */
export function CarriedBox({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g>
      <Px x={x} y={y} w={12} h={9} c="ink" />
      <Px x={x + 1} y={y + 1} w={10} h={7} c="cardboard" />
      <Px x={x + 1} y={y + 6} w={10} h={2} c="cardboard-dark" />
      <Px x={x + 5} y={y + 1} w={2} h={2} c="paper" />
    </g>
  )
}

/**
 * What a standing character holds, drawn over its front at hand height. Coordinates are the
 * figure's own: its top-left corner is the origin.
 */
export function CarriedItem({ carry }: { carry: FloorCarry }): React.JSX.Element {
  const centre = FIGURE.w / 2
  switch (carry) {
    case 'folder':
      return <Folder x={centre - 5} y={11} />
    case 'envelope':
      return <Envelope x={centre - 5} y={12} tint={null} />
    case 'note':
      return <Note x={centre - 3} y={12} />
    case 'ticket':
      return <Ticket x={centre - 4} y={12} />
    case 'box':
      return <CarriedBox x={centre - 6} y={10} />
  }
}

/**
 * The mark on a character the feed is pointing at: a ring in the focus colour around it, pulsing
 * unless motion is reduced. `at` is where the character's feet rest.
 */
export function FloorHighlightRing({ at }: { at: FloorPoint }): React.JSX.Element {
  return (
    <rect
      x={at.x - FIGURE.w / 2 - 3.5}
      y={at.y - FIGURE.h - 2.5}
      width={FIGURE.w + 7}
      height={FIGURE.h + 6}
      rx={2}
      fill="none"
      strokeWidth={1}
      className="animate-pulse stroke-ring motion-reduce:animate-none"
    />
  )
}
