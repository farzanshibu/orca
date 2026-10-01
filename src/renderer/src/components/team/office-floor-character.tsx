import React, { useEffect, useRef, useState } from 'react'
import { DESK_CELL } from './office-floor-layout'
import { ChairBack } from './office-floor-scene'
import { FIGURE, FigureBack, FigureFront, Px, type Look } from './office-floor-sprite'

const WALK_MS = 2_400

function Bubble({
  kind,
  seated
}: {
  kind: 'question' | 'mail'
  seated: boolean
}): React.JSX.Element {
  // Seated, above the head is the monitor; float it beside the chair instead.
  const at = seated ? `translate(${FIGURE.w - 1} -2)` : `translate(${FIGURE.w / 2 - 6} -14)`
  return (
    <g transform={at}>
      <g className="team-office-float">
        <Px x={0} y={0} w={12} h={10} c="ink" />
        <Px x={1} y={1} w={10} h={8} c={kind === 'question' ? 'screen-wait' : 'paper'} />
        <Px x={5} y={10} w={2} h={2} c="ink" />
        {kind === 'question' ? (
          <>
            <Px x={4} y={2} w={4} h={1} c="ink" />
            <Px x={7} y={3} w={1} h={2} c="ink" />
            <Px x={5} y={5} w={2} h={1} c="ink" />
            <Px x={5} y={7} w={2} h={1} c="ink" />
          </>
        ) : (
          <>
            <Px x={2} y={2} w={8} h={1} c="ink" />
            <Px x={3} y={3} w={2} h={1} c="ink" />
            <Px x={7} y={3} w={2} h={1} c="ink" />
            <Px x={5} y={4} w={2} h={1} c="ink" />
          </>
        )}
      </g>
    </g>
  )
}

export function FloorCharacter({
  id,
  name,
  look,
  needsYou,
  seated,
  hasMail,
  x,
  y,
  onOpenRoom
}: {
  id: string
  name: string
  look: Look
  /** Draws the "?" bubble; from the team's attention list, not from this member's own status. */
  needsYou: boolean
  seated: boolean
  hasMail: boolean
  /** Where the feet rest, in art units. */
  x: number
  y: number
  onOpenRoom: (memberId: string) => void
}): React.JSX.Element {
  const [moving, setMoving] = useState(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const previous = last.current
    last.current = { x, y }
    if (!previous || (previous.x === x && previous.y === y)) {
      return undefined
    }
    setMoving(true)
    const timer = window.setTimeout(() => setMoving(false), WALK_MS)
    return () => window.clearTimeout(timer)
  }, [x, y])
  return (
    // Desks are the keyboard targets; a wandering character is a pointer shortcut to the same room.
    <g
      data-moving={moving ? 'true' : undefined}
      className="team-office-character cursor-pointer"
      style={{
        transform: `translate(${x - FIGURE.w / 2}px, ${y - FIGURE.h}px)`
      }}
      onClick={() => onOpenRoom(id)}
    >
      <title>{name}</title>
      <g className="team-office-body">
        {seated ? (
          <>
            <FigureBack look={look} />
            <ChairBack x={FIGURE.w / 2 - DESK_CELL.w / 2} y={-28} />
          </>
        ) : (
          <>
            <Px x={2} y={FIGURE.h - 1} w={FIGURE.w - 4} h={2} c="shadow" />
            <FigureFront look={look} />
          </>
        )}
      </g>
      {needsYou ? (
        <Bubble kind="question" seated={seated} />
      ) : hasMail ? (
        <Bubble kind="mail" seated={seated} />
      ) : null}
      {seated ? null : (
        <text x={FIGURE.w / 2} y={FIGURE.h + 8} textAnchor="middle" className="team-office-label">
          {name}
        </text>
      )}
    </g>
  )
}
