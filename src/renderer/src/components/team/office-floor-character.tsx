import React from 'react'
import { ChairBack, type ScreenState } from './office-floor-desk-art'
import type { FloorDesk, FloorFacing, FloorPoint } from './office-floor-plan'
import { DeskForeground } from './office-floor-pods'
import {
  FIGURE,
  FigureBack,
  FigureSeatedFront,
  SEATED_FRONT_H,
  type Look
} from './office-floor-sprite'

/**
 * Someone sitting at `at`, a seat anchor's point. Facing the viewer they are behind the furniture,
 * cut off at its edge; facing away they are in front of it, with their chair's back over them.
 */
export function SeatedFigure({
  at,
  facing,
  look
}: {
  at: FloorPoint
  facing: FloorFacing
  look: Look
}): React.JSX.Element {
  const x = at.x - FIGURE.w / 2
  if (facing === 'viewer') {
    return (
      <g transform={`translate(${x} ${at.y - SEATED_FRONT_H})`}>
        <FigureSeatedFront look={look} />
      </g>
    )
  }
  return (
    <g>
      <g transform={`translate(${x} ${at.y - FIGURE.h})`}>
        <FigureBack look={look} />
      </g>
      <ChairBack at={at} />
    </g>
  )
}

/**
 * A member at their desk, with whatever on the desk stands between them and the viewer drawn over
 * them. Purely visual: the desk's click target sits underneath and owns the pointer.
 */
export function SeatedCharacter({
  desk,
  look,
  screen
}: {
  desk: FloorDesk
  look: Look
  screen: ScreenState
}): React.JSX.Element {
  return (
    <g>
      <SeatedFigure at={desk.seat} facing={desk.facing} look={look} />
      <DeskForeground desk={desk} state={screen} />
    </g>
  )
}
