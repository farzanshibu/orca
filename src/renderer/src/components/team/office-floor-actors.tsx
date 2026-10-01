import React, { useLayoutEffect, useMemo, useRef } from 'react'
import type { FloorAwayPose, FloorEnvelope } from './office-choreography-scene'
import { homeOf, placeKey, type FloorEffect } from './office-choreography-state'
import { SeatedFigure } from './office-floor-character'
import type { FloorClock } from './office-floor-clock'
import type { FloorCarry } from './office-floor-events'
import { rectPlacement } from './office-floor-placement'
import { floorAnchor, type FloorPoint } from './office-floor-plan'
import {
  ACTOR_FRAME,
  BOX_FRAME,
  CarriedBox,
  CarriedItem,
  ENVELOPE_FRAME,
  Envelope,
  FloorHighlightRing,
  NOTE_FRAME,
  Note
} from './office-floor-props'
import type { PlacedMember } from './office-floor-roster'
import { FIGURE, FigureFront, memberLook, type Look } from './office-floor-sprite'
import { placePoint, placeStance, walkRoute, type FloorStage } from './office-floor-walk-route'
import {
  animateFlight,
  animateLanding,
  animateWalk,
  driveAnimation,
  frameTransform,
  type SpriteFrame
} from './office-walk-animation'
import type { OfficeChoreography } from './use-office-choreography'

// An envelope leaves and lands over the desk, not at the feet of whoever sits there.
const ENVELOPE_LIFT = 16
const LANDING_MS = 260
// Only so many notes and boxes are drawn; more than that reads as a pile either way.
const MAX_STACK = 3

/** The frame's box laid at the floor's top left, moved onto `point` by its transform. */
function frameStyle(stage: FloorStage, frame: SpriteFrame, point: FloorPoint): React.CSSProperties {
  return {
    ...rectPlacement(stage.plan, { x: 0, y: 0, w: frame.w, h: frame.h }),
    transform: frameTransform(frame, point)
  }
}

function frameViewBox(frame: SpriteFrame): string {
  return `0 0 ${frame.w} ${frame.h}`
}

function StandingFigure({
  look,
  carry
}: {
  look: Look
  carry: FloorCarry | null
}): React.JSX.Element {
  const { origin } = ACTOR_FRAME
  return (
    <g transform={`translate(${origin.x - FIGURE.w / 2} ${origin.y - FIGURE.h})`}>
      <FigureFront look={look} />
      {carry ? <CarriedItem carry={carry} /> : null}
    </g>
  )
}

/**
 * One member away from their desk. While it walks, a single animation carries it along its route;
 * it is on its feet for the whole walk and only sits once it has arrived at a chair.
 */
function FloorActor({
  stage,
  memberId,
  look,
  pose,
  clock,
  highlighted
}: {
  stage: FloorStage
  memberId: string
  look: Look
  pose: FloorAwayPose
  clock: FloorClock
  highlighted: boolean
}): React.JSX.Element | null {
  const ref = useRef<SVGSVGElement>(null)
  const walk = pose.kind === 'walking' ? pose.walk : null
  const route = useMemo(() => (walk ? walkRoute(stage, walk.from, walk.to) : null), [stage, walk])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !walk || !route) {
      return undefined
    }
    const animation = animateWalk(element, route, ACTOR_FRAME, walk.endsAt - walk.startedAt)
    return animation ? driveAnimation(animation, clock, walk.startedAt) : undefined
  }, [clock, route, walk])

  // Without an animation to carry it, a walker is drawn where it is going.
  const place = pose.kind === 'walking' ? pose.walk.to : pose.at
  const carry = pose.kind === 'walking' ? pose.walk.carrying : pose.holding
  const point = placePoint(stage, place)
  if (!point) {
    return null
  }
  const stance = placeStance(stage, place)
  const sitting = pose.kind === 'away' && stance.seated
  return (
    <svg
      ref={ref}
      viewBox={frameViewBox(ACTOR_FRAME)}
      data-floor-actor={memberId}
      data-pose={pose.kind === 'walking' ? 'walking' : sitting ? 'sitting' : 'standing'}
      data-place={placeKey(place)}
      data-carrying={carry ?? undefined}
      data-highlighted={highlighted ? 'true' : undefined}
      style={frameStyle(stage, ACTOR_FRAME, point)}
      className="team-office absolute overflow-visible"
    >
      {sitting ? (
        <SeatedFigure at={ACTOR_FRAME.origin} facing={stance.facing} look={look} />
      ) : (
        <StandingFigure look={look} carry={carry} />
      )}
      {highlighted ? <FloorHighlightRing at={ACTOR_FRAME.origin} /> : null}
    </svg>
  )
}

function overDesk(stage: FloorStage, memberId: string): FloorPoint | null {
  const seat = placePoint(stage, homeOf(memberId))
  return seat ? { x: seat.x, y: seat.y - ENVELOPE_LIFT } : null
}

/** Mail from a member who is too busy to walk it over: it flies from their desk to the recipient's. */
function FlyingEnvelope({
  stage,
  envelope,
  clock
}: {
  stage: FloorStage
  envelope: FloorEnvelope
  clock: FloorClock
}): React.JSX.Element | null {
  const ref = useRef<SVGSVGElement>(null)
  const { fromId, toId, tint } = envelope.show
  const { startAt, endAt } = envelope

  useLayoutEffect(() => {
    const element = ref.current
    const from = overDesk(stage, fromId)
    const to = overDesk(stage, toId)
    if (!element || !from || !to) {
      return undefined
    }
    const animation = animateFlight(element, from, to, ENVELOPE_FRAME, endAt - startAt)
    return animation ? driveAnimation(animation, clock, startAt) : undefined
  }, [clock, endAt, fromId, stage, startAt, toId])

  const landing = overDesk(stage, toId)
  if (!landing) {
    return null
  }
  return (
    <svg
      ref={ref}
      viewBox={frameViewBox(ENVELOPE_FRAME)}
      data-floor-envelope={envelope.id}
      data-tint={tint ?? undefined}
      style={frameStyle(stage, ENVELOPE_FRAME, landing)}
      className="team-office absolute overflow-visible"
    >
      <Envelope x={1} y={1} tint={tint} />
    </svg>
  )
}

/** Something that appears in place and stays a while: a note at reception, a box at the dock. */
function LandedProp({
  stage,
  frame,
  at,
  startAt,
  clock,
  still,
  kind,
  children
}: {
  stage: FloorStage
  frame: SpriteFrame
  at: FloorPoint
  startAt: number
  clock: FloorClock
  /** Motion is reduced: it is simply there. */
  still: boolean
  kind: 'note' | 'box'
  children: React.ReactNode
}): React.JSX.Element {
  const ref = useRef<SVGSVGElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || still) {
      return undefined
    }
    const animation = animateLanding(element, LANDING_MS)
    return animation ? driveAnimation(animation, clock, startAt) : undefined
  }, [clock, startAt, still])

  return (
    <svg
      ref={ref}
      viewBox={frameViewBox(frame)}
      data-floor-prop={kind}
      style={frameStyle(stage, frame, at)}
      className="team-office absolute overflow-visible"
    >
      {children}
    </svg>
  )
}

function stacked(effects: readonly FloorEffect[]): readonly FloorEffect[] {
  return effects.slice(-MAX_STACK)
}

/**
 * Everything on the floor that is not sitting at a desk: members on an errand, envelopes in the
 * air, a note landing at reception, a box set down at the dock. Its own layer above the seated
 * one, and blind to the pointer, so a desk stays clickable through whoever walks past it.
 */
export function FloorActors({
  stage,
  placed,
  choreography,
  highlighted
}: {
  stage: FloorStage
  placed: readonly PlacedMember[]
  choreography: OfficeChoreography
  highlighted: ReadonlySet<string>
}): React.JSX.Element {
  const { scene, clock, reducedMotion } = choreography
  const { noteTray } = stage.plan.fixtures
  const dock = floorAnchor(stage.plan, 'dock')?.point
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {stacked(scene.notes).map((note, index) => (
        <LandedProp
          key={note.id}
          stage={stage}
          frame={NOTE_FRAME}
          at={{ x: noteTray.x + 4 + index * 4, y: noteTray.y + noteTray.h - 1 - index }}
          startAt={note.startAt}
          clock={clock}
          still={reducedMotion}
          kind="note"
        >
          <Note x={1} y={0} />
        </LandedProp>
      ))}
      {dock
        ? stacked(scene.boxes).map((box, index) => (
            <LandedProp
              key={box.id}
              stage={stage}
              frame={BOX_FRAME}
              // Beside where its carrier stands, on the dock plate.
              at={{ x: dock.x - 14 + index * 3, y: dock.y - index * 4 }}
              startAt={box.startAt}
              clock={clock}
              still={reducedMotion}
              kind="box"
            >
              <CarriedBox x={1} y={1} />
            </LandedProp>
          ))
        : null}
      {placed.map(({ member }) => {
        const pose = scene.poses.get(member.id)
        return pose ? (
          <FloorActor
            key={member.id}
            stage={stage}
            memberId={member.id}
            look={memberLook(member.slug, Boolean(member.is_manager))}
            pose={pose}
            clock={clock}
            highlighted={highlighted.has(member.id)}
          />
        ) : null
      })}
      {scene.envelopes.map((envelope) => (
        <FlyingEnvelope key={envelope.id} stage={stage} envelope={envelope} clock={clock} />
      ))}
    </div>
  )
}
