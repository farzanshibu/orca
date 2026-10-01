import { kitchenBreak } from './office-choreography-rules'
import {
  KITCHEN_BREAK_AFTER_MS,
  KITCHEN_SPOTS,
  MAX_QUEUED_JOBS,
  effectId,
  homeOf,
  placeKey,
  samePlace,
  type ChoreographyState,
  type FloorEffectDraft,
  type FloorJob,
  type FloorPlace,
  type FloorTrack
} from './office-choreography-state'
import type { FloorCarry } from './office-floor-events'
import { kitchenAnchorId, type FloorAnchorId } from './office-floor-plan'

/** What a track needs from the step that is moving it. */
export type TrackContext = {
  /** The state being stepped: tracks add effects to it and read its meetings. */
  state: ChoreographyState
  walkMs: (from: FloorPlace, to: FloorPlace) => number
  isIdle: (memberId: string) => boolean
}

export function addEffects(
  state: ChoreographyState,
  ownerId: string,
  drafts: readonly FloorEffectDraft[],
  at: number
): void {
  drafts.forEach((draft, index) => {
    const startAt = at + draft.afterMs
    state.effects.push({
      id: effectId(ownerId, draft.key ?? index),
      startAt,
      endAt: startAt + draft.lastsMs,
      show: draft.show
    })
  })
}

/** Numbered anchors (conference chairs, kitchen spots) nobody is at or headed for, lowest first. */
export function freeSpots(
  state: ChoreographyState,
  anchorOf: (index: number) => FloorAnchorId,
  count: number
): number[] {
  const taken = new Set<string>()
  for (const track of state.tracks.values()) {
    const places = [track.at, track.walk?.to, track.job?.to, ...track.queue.map((job) => job.to)]
    for (const place of places) {
      if (place) {
        taken.add(placeKey(place))
      }
    }
  }
  return Array.from({ length: count }, (_, index) => index).filter(
    (index) => !taken.has(anchorOf(index))
  )
}

/** Puts the character back at its desk with nothing left to do, without walking it there. */
export function sendHome(track: FloorTrack): void {
  track.at = homeOf(track.memberId)
  track.walk = null
  track.job = null
  track.stayUntil = null
  track.holding = null
  track.queue = []
  track.overflow = 0
}

function setOut(
  ctx: TrackContext,
  track: FloorTrack,
  to: FloorPlace,
  carrying: FloorCarry | null,
  at: number
): void {
  const walkMs = samePlace(track.at, to) ? 0 : ctx.walkMs(track.at, to)
  if (walkMs > 0) {
    track.walk = { from: track.at, to, startedAt: at, endsAt: at + walkMs, carrying }
    return
  }
  track.at = to
  land(ctx, track, at)
}

/** The character has just reached `track.at`: its errand's place, or its own desk. */
function land(ctx: TrackContext, track: FloorTrack, at: number): void {
  const job = track.job
  if (!job) {
    proceed(ctx, track, at)
    return
  }
  const meetingEnd = ctx.state.meetings.find((meeting) => meeting.id === job.meetingId)?.endsAt ?? 0
  track.holding = job.holding
  track.stayUntil = Math.max(at + job.stayMs, meetingEnd)
  addEffects(ctx.state, job.id, job.arrive, at)
  const taken = ctx.state.effects.find((effect) => effect.id === job.takes)
  if (taken) {
    taken.endAt = Math.min(taken.endAt, at)
  }
}

/** Done where it is: on to the next errand, or home, or settled at its desk. */
export function proceed(ctx: TrackContext, track: FloorTrack, at: number): void {
  const next = track.queue.shift()
  track.job = next ?? null
  track.stayUntil = null
  if (next) {
    track.holding = null
    setOut(ctx, track, next.to, next.carrying, at)
    return
  }
  const home = homeOf(track.memberId)
  if (!samePlace(track.at, home)) {
    setOut(ctx, track, home, track.holding, at)
    return
  }
  track.holding = null
  track.overflow = 0
  // The break clock runs from sitting down, not from the last time work stopped.
  track.idleSince = ctx.isIdle(track.memberId) ? at : null
}

/** Ends a kitchen break because work arrived; a character still on its way there turns round. */
export function endBreak(ctx: TrackContext, track: FloorTrack, at: number): void {
  if (!track.job?.rest) {
    return
  }
  const walk = track.walk
  if (!walk) {
    proceed(ctx, track, at)
    return
  }
  track.job = null
  // Why: the way back retraces the way there, so the time left to walk is the time already walked.
  track.walk = {
    from: walk.to,
    to: walk.from,
    startedAt: at - (walk.endsAt - at),
    endsAt: at + (at - walk.startedAt),
    carrying: null
  }
}

/**
 * Hands a character an errand. A character holds only so many: past that the trip is skipped and
 * counted, though what it would have delivered still arrives.
 */
export function enqueue(ctx: TrackContext, track: FloorTrack, job: FloorJob, at: number): void {
  const held = track.queue.length + (track.job && !track.job.rest ? 1 : 0)
  if (held >= MAX_QUEUED_JOBS) {
    track.overflow += 1
    addEffects(ctx.state, job.id, job.arrive, at)
    return
  }
  track.queue.push(job)
  if (track.job?.rest) {
    endBreak(ctx, track, at)
  } else if (!track.walk && !track.job) {
    proceed(ctx, track, at)
  }
}

/** When this track next changes by itself, or null while it only waits for something to happen. */
export function trackDueAt(track: FloorTrack): number | null {
  if (track.walk) {
    return track.walk.endsAt
  }
  if (track.job) {
    return track.stayUntil !== null && Number.isFinite(track.stayUntil) ? track.stayUntil : null
  }
  return track.idleSince === null ? null : track.idleSince + KITCHEN_BREAK_AFTER_MS
}

function takeBreak(ctx: TrackContext, track: FloorTrack, at: number): void {
  const [spot] = freeSpots(ctx.state, kitchenAnchorId, KITCHEN_SPOTS)
  if (spot === undefined) {
    // The kitchen is full: ask again after another wait.
    track.idleSince = at
    return
  }
  track.job = kitchenBreak(track.memberId, spot)
  setOut(ctx, track, track.job.to, null, at)
}

/** Makes whatever change of this track is due at `at`; one change a call. */
export function advanceTrack(ctx: TrackContext, track: FloorTrack, at: number): void {
  const due = trackDueAt(track)
  if (due === null || due > at) {
    return
  }
  if (track.walk) {
    track.at = track.walk.to
    track.walk = null
    land(ctx, track, at)
  } else if (track.job) {
    proceed(ctx, track, at)
  } else {
    takeBreak(ctx, track, at)
  }
}
