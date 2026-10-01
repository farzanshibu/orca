import React from 'react'
import {
  OFFICE_HAIR_PAINTS,
  OFFICE_SHIRT_PAINTS,
  OFFICE_SKIN_PAINTS,
  paintFill,
  shirtShade,
  type HairPaint,
  type Paint,
  type ShirtPaint,
  type SkinPaint
} from './office-floor-palette'

/** One art pixel run. Paint goes through inline style so the palette stays in CSS variables. */
export function Px({
  x,
  y,
  w = 1,
  h = 1,
  c
}: {
  x: number
  y: number
  w?: number
  h?: number
  c: Paint
}): React.JSX.Element {
  return <rect x={x} y={y} width={w} height={h} style={{ fill: paintFill(c) }} />
}

export const FIGURE = { w: 14, h: 22 }
const HAIR_STYLES = 5

export type Look = {
  hairStyle: number
  skin: SkinPaint
  hair: HairPaint
  shirt: ShirtPaint
  tie: boolean
}

function stableHash(seed: string): number {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

/** A stable look per member so a character stays recognisable across renders and sessions. */
export function memberLook(slug: string, isManager: boolean): Look {
  const hash = stableHash(slug)
  return {
    hairStyle: hash % HAIR_STYLES,
    skin: OFFICE_SKIN_PAINTS[(hash >> 3) % OFFICE_SKIN_PAINTS.length],
    hair: OFFICE_HAIR_PAINTS[(hash >> 5) % OFFICE_HAIR_PAINTS.length],
    shirt: isManager ? 'shirt-suit' : OFFICE_SHIRT_PAINTS[(hash >> 7) % OFFICE_SHIRT_PAINTS.length],
    tie: isManager
  }
}

function FrontHair({ look }: { look: Look }): React.JSX.Element {
  const { hair } = look
  switch (look.hairStyle) {
    case 1: // long
      return (
        <>
          <Px x={2} y={0} w={10} h={3} c="ink" />
          <Px x={1} y={2} w={3} h={9} c="ink" />
          <Px x={10} y={2} w={3} h={9} c="ink" />
          <Px x={3} y={1} w={8} h={2} c={hair} />
          <Px x={2} y={3} w={2} h={7} c={hair} />
          <Px x={10} y={3} w={2} h={7} c={hair} />
        </>
      )
    case 2: // top bun
      return (
        <>
          <Px x={5} y={-2} w={4} h={3} c="ink" />
          <Px x={6} y={-1} w={2} h={1} c={hair} />
          <Px x={2} y={0} w={10} h={3} c="ink" />
          <Px x={3} y={1} w={8} h={2} c={hair} />
          <Px x={3} y={3} w={1} h={2} c={hair} />
          <Px x={10} y={3} w={1} h={2} c={hair} />
        </>
      )
    case 3: // receding
      return (
        <>
          <Px x={3} y={3} w={1} h={3} c={hair} />
          <Px x={10} y={3} w={1} h={3} c={hair} />
        </>
      )
    case 4: // curly
      return (
        <>
          <Px x={1} y={0} w={12} h={4} c="ink" />
          <Px x={0} y={2} w={3} h={5} c="ink" />
          <Px x={11} y={2} w={3} h={5} c="ink" />
          <Px x={2} y={1} w={10} h={2} c={hair} />
          <Px x={1} y={3} w={2} h={3} c={hair} />
          <Px x={11} y={3} w={2} h={3} c={hair} />
          <Px x={3} y={3} w={8} h={1} c={hair} />
        </>
      )
    default: // short
      return (
        <>
          <Px x={2} y={0} w={10} h={3} c="ink" />
          <Px x={3} y={1} w={8} h={2} c={hair} />
          <Px x={3} y={3} w={2} h={1} c={hair} />
          <Px x={3} y={3} w={1} h={2} c={hair} />
          <Px x={10} y={3} w={1} h={2} c={hair} />
        </>
      )
  }
}

function Body({ look }: { look: Look }): React.JSX.Element {
  const { shirt, skin } = look
  return (
    <>
      <Px x={1} y={10} w={12} h={9} c="ink" />
      <Px x={2} y={11} w={10} h={7} c={shirt} />
      <Px x={4} y={11} w={6} h={1} c={shirtShade(shirt)} />
      {look.tie ? (
        <>
          <Px x={6} y={11} w={2} h={1} c="paper" />
          <Px x={6} y={12} w={2} h={4} c="tie" />
        </>
      ) : null}
      <Px x={1} y={17} w={2} h={1} c={skin} />
      <Px x={11} y={17} w={2} h={1} c={skin} />
    </>
  )
}

/** Front view: standing, walking, or lounging. Feet rest on the bottom edge. */
export function FigureFront({ look }: { look: Look }): React.JSX.Element {
  const { skin } = look
  return (
    <g>
      <Px x={2} y={1} w={10} h={10} c="ink" />
      <Px x={3} y={2} w={8} h={8} c={skin} />
      <FrontHair look={look} />
      <Px x={5} y={5} w={1} h={2} c="ink" />
      <Px x={8} y={5} w={1} h={2} c="ink" />
      <Px x={4} y={7} w={1} h={1} c="blush" />
      <Px x={9} y={7} w={1} h={1} c="blush" />
      <Px x={6} y={8} w={2} h={1} c="mouth" />
      <Body look={look} />
      <Px x={3} y={18} w={8} h={4} c="ink" />
      <Px x={4} y={18} w={2} h={3} c="pants" />
      <Px x={8} y={18} w={2} h={3} c="pants" />
    </g>
  )
}

/** Back view: seated at a desk, facing the monitor. */
export function FigureBack({ look }: { look: Look }): React.JSX.Element {
  const { hair, skin } = look
  const bald = look.hairStyle === 3
  return (
    <g>
      <Px x={2} y={1} w={10} h={10} c="ink" />
      <Px x={1} y={5} w={1} h={2} c="ink" />
      <Px x={12} y={5} w={1} h={2} c="ink" />
      <Px x={1} y={5} w={1} h={1} c={skin} />
      <Px x={12} y={5} w={1} h={1} c={skin} />
      <Px x={3} y={2} w={8} h={8} c={bald ? skin : hair} />
      {bald ? <Px x={3} y={7} w={8} h={3} c={hair} /> : null}
      {look.hairStyle === 1 ? <Px x={3} y={10} w={8} h={3} c={hair} /> : null}
      {look.hairStyle === 2 ? <Px x={5} y={-1} w={4} h={3} c={hair} /> : null}
      <Px x={1} y={10} w={12} h={9} c="ink" />
      <Px x={2} y={11} w={10} h={7} c={look.shirt} />
      <Px x={6} y={11} w={2} h={7} c={shirtShade(look.shirt)} />
    </g>
  )
}

/** Head-and-shoulders crop of the front view, for roster cards. */
export function Portrait({ look, size = 40 }: { look: Look; size?: number }): React.JSX.Element {
  return (
    <svg
      viewBox="-1 -2 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      className="team-office shrink-0 rounded-md bg-muted"
    >
      <FigureFront look={look} />
    </svg>
  )
}
