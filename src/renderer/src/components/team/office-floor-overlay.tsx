import React from 'react'
import { Mail } from 'lucide-react'
import { AgentQuestionIcon } from '@/components/AgentQuestionIcon'
import type { FloorPoint, OfficeFloorPlan } from './office-floor-plan'
import { pointPlacement, rectPlacement, widthPlacement } from './office-floor-placement'

/** A name under a desk or a character. */
export type FloorNameplate = {
  id: string
  /** Top centre of the label, in art units; its bottom centre when `above`. */
  at: FloorPoint
  /** The label hangs over `at` and grows upward: for a name over a head, not under a chair. */
  above?: boolean
  /** Art units the label may span before it truncates. */
  width: number
  name: string
  /** A second line, for a state the art alone does not show. */
  status?: string
  dim: boolean
}

/** A marker floating beside a character. */
export type FloorBadge = {
  id: string
  /** Centre of the marker, in art units. */
  at: FloorPoint
  kind: 'question' | 'mail'
}

/**
 * Every word on the floor. It is HTML laid over the art rather than SVG text, so type stays at its
 * real size however far the floor is scaled, and it never takes the pointer from the desks below.
 */
export function FloorOverlay({
  plan,
  teamName,
  whiteboard,
  nameplates,
  badges
}: {
  plan: OfficeFloorPlan
  /** Shown on the reception sign. */
  teamName: string
  /** What is written on the whiteboard; the board keeps its scribbles when there is nothing. */
  whiteboard?: React.ReactNode
  nameplates: readonly FloorNameplate[]
  badges: readonly FloorBadge[]
}): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        style={rectPlacement(plan, plan.fixtures.sign)}
        className="absolute flex items-center justify-center px-0.5"
      >
        <span className="truncate text-[11px] leading-none font-semibold tracking-[0.05em] text-card-foreground uppercase">
          {teamName}
        </span>
      </div>
      {whiteboard === undefined || whiteboard === null ? null : (
        <div
          style={rectPlacement(plan, plan.fixtures.whiteboard)}
          className="absolute overflow-hidden p-1 text-[11px] leading-snug text-card-foreground"
        >
          {whiteboard}
        </div>
      )}
      {nameplates.map(({ id, at, above, width, name, status, dim }) => (
        <div
          key={id}
          aria-hidden="true"
          data-dim={dim ? 'true' : undefined}
          data-above={above ? 'true' : undefined}
          style={{
            ...pointPlacement(plan, { x: at.x - width / 2, y: at.y }),
            width: widthPlacement(plan, width)
          }}
          className="group absolute flex flex-col items-center data-[above=true]:-translate-y-full"
        >
          <span className="max-w-full truncate rounded-sm bg-background/80 px-1 text-[11px] leading-[14px] font-medium text-foreground group-data-[dim=true]:text-muted-foreground">
            {name}
          </span>
          {status ? (
            <span className="max-w-full truncate rounded-sm bg-background/80 px-1 text-[11px] leading-[14px] text-muted-foreground">
              {status}
            </span>
          ) : null}
        </div>
      ))}
      {badges.map(({ id, at, kind }) => (
        <span
          key={id}
          aria-hidden="true"
          style={pointPlacement(plan, at)}
          className="team-office-float absolute flex size-4.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-xs"
        >
          {kind === 'question' ? (
            <AgentQuestionIcon className="size-3" />
          ) : (
            <Mail className="size-3 text-muted-foreground" />
          )}
        </span>
      ))}
    </div>
  )
}
