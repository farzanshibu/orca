import React from 'react'
import { Ticket } from 'lucide-react'
import type { FloorScene } from './office-choreography-scene'
import { pointPlacement, widthPlacement } from './office-floor-placement'
import type { FloorDesk, OfficeFloorPlan } from './office-floor-plan'
import type { PlacedMember } from './office-floor-roster'
import { FIGURE } from './office-floor-sprite'

export type FloorBubbleDesk = { desk: FloorDesk; entry: PlacedMember | undefined }

// How far the cloud dips into the hair of someone seen from behind, to stay clear of their desk's ticket.
const HAIR_OVERLAP = 2

/**
 * A working member's live activity, floating over them: the tool in hand and what it is aimed at,
 * so several people working at once can be told apart at a glance. It sits over the name where
 * the name is above the head, and on the crown of the head where the name is under the chair.
 */
function ThoughtCloud({
  plan,
  desk,
  memberId,
  thought
}: {
  plan: OfficeFloorPlan
  desk: FloorDesk
  memberId: string
  thought: string
}): React.JSX.Element {
  const overName = desk.nameplate.above
  const at = overName
    ? desk.nameplate.at
    : { x: desk.seat.x, y: desk.seat.y - FIGURE.h + HAIR_OVERLAP }
  return (
    <span
      data-floor-thought={memberId}
      data-over-name={overName ? 'true' : undefined}
      style={{ ...pointPlacement(plan, at), maxWidth: widthPlacement(plan, desk.cell.w) }}
      // The name under it is one 14px line: the cloud clears it by a pixel.
      className="absolute -translate-x-1/2 -translate-y-full truncate rounded-md border border-border bg-popover px-1 font-mono text-[11px] leading-[14px] text-popover-foreground shadow-xs data-[over-name=true]:-translate-y-[calc(100%+15px)]"
    >
      {thought}
    </span>
  )
}

/**
 * What floats over the desks because of what just happened: a thought cloud over everyone who is
 * working, a ticket over whoever was handed work without leaving their desk, and "+N" over a
 * member with more errands than they will be shown running. HTML over the art, like every other
 * word on the floor, and blind to the pointer.
 */
export function FloorBubbles({
  plan,
  desks,
  scene,
  thoughts
}: {
  plan: OfficeFloorPlan
  desks: readonly FloorBubbleDesk[]
  scene: FloorScene
  /** Each member's thought-cloud line, by member id; empty or missing shows no cloud. */
  thoughts: Readonly<Record<string, string>>
}): React.JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {desks.map(({ desk, entry }) => {
        if (!entry) {
          return null
        }
        const { id } = entry.member
        const thought = thoughts[id] ?? ''
        const overflow = scene.overflow.get(id) ?? 0
        return (
          <React.Fragment key={id}>
            {entry.activity === 'working' && thought && !scene.poses.has(id) ? (
              <ThoughtCloud plan={plan} desk={desk} memberId={id} thought={thought} />
            ) : null}
            {scene.badges.get(id) === 'ticket' ? (
              <span
                data-floor-badge={id}
                data-kind="ticket"
                style={pointPlacement(plan, { x: desk.seat.x - 13, y: desk.seat.y - 15 })}
                className="team-office-float absolute flex size-4.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-xs"
              >
                <Ticket className="size-3 text-muted-foreground" />
              </span>
            ) : null}
            {overflow > 0 ? (
              <span
                data-floor-overflow={id}
                style={pointPlacement(plan, { x: desk.seat.x + 13, y: desk.seat.y - 27 })}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background px-1 text-[11px] leading-4 font-medium text-muted-foreground shadow-xs"
              >
                +{overflow}
              </span>
            ) : null}
          </React.Fragment>
        )
      })}
    </div>
  )
}
