import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type { OfficeProofSession } from './office-choreography-proof'
import type { FloorScene } from './office-choreography-scene'
import type { FloorCastMember, FloorPlace } from './office-choreography-state'
import { WALL_CLOCK, type FloorClock } from './office-floor-clock'
import { createFloorDirector } from './office-floor-director'
import type { PlacedMember } from './office-floor-roster'
import { walkRoute, type FloorStage } from './office-floor-walk-route'
import { walkDurationMs } from './office-walk-animation'
import {
  subscribeToWindowVisibility,
  windowIsVisible,
  type TeamActivity
} from './use-team-activity'

// A proof's events are their own feed: nothing derived from the team's may carry over.
const PROOF_EPOCH = -1

export type OfficeChoreography = {
  scene: FloorScene
  /** The clock the scene's times are on; a walk's animation is tied to it. */
  clock: FloorClock
  reducedMotion: boolean
}

function sameCast(a: readonly FloorCastMember[], b: readonly FloorCastMember[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (member, index) =>
        member.id === b[index].id &&
        member.manager === b[index].manager &&
        member.activity === b[index].activity
    )
  )
}

/** Who is on the floor and what each is doing; the same array until one of those facts changes. */
function useFloorCast(placed: readonly PlacedMember[]): readonly FloorCastMember[] {
  const held = useRef<readonly FloorCastMember[]>([])
  const cast = placed.map(({ member, activity }) => ({
    id: member.id,
    manager: Boolean(member.is_manager),
    activity
  }))
  // Why a ref written during render: the comparison is idempotent, so a repeated or discarded
  // render lands on the same array, and the director is only stepped when the cast really changed.
  if (!sameCast(held.current, cast)) {
    held.current = cast
  }
  return held.current
}

/**
 * Acts the team's live activity out on the floor: who has left their desk and where they are,
 * what is in the air, and which badges are up. One timer, owned by the director, wakes it for the
 * next change; nothing re-renders on an interval.
 */
export function useOfficeChoreography({
  activity,
  stage,
  placed,
  proof
}: {
  activity: Pick<TeamActivity, 'live' | 'epoch'>
  /** The plan and its seating; null until the floor has been measured. */
  stage: FloorStage | null
  placed: readonly PlacedMember[]
  /** Set only while a probe has taken the floor over. */
  proof: OfficeProofSession | null
}): OfficeChoreography {
  const [director] = useState(createFloorDirector)
  const prefersReducedMotion = usePrefersReducedMotion()
  const windowVisible = useSyncExternalStore(subscribeToWindowVisibility, windowIsVisible)
  const cast = useFloorCast(placed)
  const reducedMotion = proof?.reducedMotion ?? prefersReducedMotion
  const hidden = proof ? proof.hidden : !windowVisible
  const clock = proof?.clock ?? WALL_CLOCK
  const { live, epoch } = activity
  const proofEntries = proof?.entries

  useEffect(() => {
    // Until the floor is measured there is nowhere to walk; the first step waits for the plan.
    if (!stage) {
      return
    }
    director.setInput({
      clock,
      epoch: proofEntries ? PROOF_EPOCH : epoch,
      live: proofEntries ?? (() => live),
      cast,
      reducedMotion,
      hidden,
      walkMs: (from: FloorPlace, to: FloorPlace) =>
        walkDurationMs(walkRoute(stage, from, to)?.length ?? 0)
    })
  }, [cast, clock, director, epoch, hidden, live, proofEntries, reducedMotion, stage])

  useEffect(() => () => director.dispose(), [director])

  const scene = useSyncExternalStore(director.subscribe, director.scene)
  return useMemo(() => ({ scene, clock, reducedMotion }), [scene, clock, reducedMotion])
}
