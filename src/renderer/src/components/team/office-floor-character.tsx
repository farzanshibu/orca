import React from 'react'
import { ChairBack } from './office-floor-desk-art'
import type { FloorDesk } from './office-floor-plan'
import { FIGURE, FigureBack, type Look } from './office-floor-sprite'

/**
 * A member at their desk, seen from behind, with the chair back in front of them. Purely visual:
 * the desk's click target sits underneath and owns the pointer.
 */
export function SeatedCharacter({
  desk,
  look
}: {
  desk: FloorDesk
  look: Look
}): React.JSX.Element {
  const { seat, cell } = desk
  const x = seat.x - FIGURE.w / 2
  const y = seat.y - FIGURE.h
  return (
    <g>
      <g transform={`translate(${x} ${y})`}>
        <FigureBack look={look} />
      </g>
      <ChairBack x={cell.x} y={cell.y} />
    </g>
  )
}
