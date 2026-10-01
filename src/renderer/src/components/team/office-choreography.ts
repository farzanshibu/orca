import { planBeat } from './office-choreography-rules'
import {
  BEAT_STAGGER_MS,
  CONFERENCE_SEATS,
  DISPATCH_GATHER_MS,
  MAX_BEAT_LAG_MS,
  SNAP_AFTER_HIDDEN_MS,
  homeTrack,
  walksTheFloor,
  type ChoreographyState,
  type FloorCastMember,
  type FloorPlace,
  type FloorPose,
  type PendingBeat
} from './office-choreography-state'
import {
  addEffects,
  advanceTrack,
  endBreak,
  enqueue,
  freeSpots,
  sendHome,
  trackDueAt,
  type TrackContext
} from './office-choreography-tracks'
import { floorIntent } from './office-floor-events'
import { conferenceAnchorId } from './office-floor-plan'
import type { TeamActivityEntry } from './team-activity-merge'

/** Everything a step reads. Time is the caller's: nothing here looks at a clock. */
export type ChoreographyInput = {
  /** The activity feed's epoch; when it moves, everything derived from the old feed is dropped. */
  epoch: number
  /** The feed's live entries, in sequence order. History is never in it. */
  live: readonly TeamActivityEntry[]
  cast: readonly FloorCastMember[]
  reducedMotion: boolean
  /** The floor is out of sight. Nothing moves, and a long absence is not caught up afterwards. */
  hidden: boolean
  /** How long the walk between two places takes; 0 when there is no such walk. */
  walkMs: (from: FloorPlace, to: FloorPlace) => number
}

// A step that needs more transitions than this is stuck, not busy.
const MAX_TRANSITIONS_PER_STEP = 10_000

/** A floor with everyone at their desks. What the feed already holds is taken as seen, never acted out. */
export function initialChoreography(
  input: Pick<ChoreographyInput, 'epoch' | 'live'>
): ChoreographyState {
  return {
    epoch: input.epoch,
    seen: new Set(input.live.map((entry) => entry.event.id)),
    lastBeatAt: Number.NEGATIVE_INFINITY,
    pending: [],
    tracks: new Map(),
    effects: [],
    meetings: [],
    hiddenSince: null
  }
}

function draftOf(state: ChoreographyState): ChoreographyState {
  return {
    ...state,
    pending: [...state.pending],
    tracks: new Map(
      [...state.tracks].map(([id, track]) => [id, { ...track, queue: [...track.queue] }])
    ),
    effects: state.effects.map((effect) => ({ ...effect })),
    meetings: [...state.meetings]
  }
}

function snap(draft: ChoreographyState, live: readonly TeamActivityEntry[]): void {
  for (const track of draft.tracks.values()) {
    sendHome(track)
    track.idleSince = null
  }
  draft.pending = []
  draft.effects = []
  draft.meetings = []
  draft.seen = new Set(live.map((entry) => entry.event.id))
  draft.lastBeatAt = Number.NEGATIVE_INFINITY
}

/** Brings the tracks in line with who is on the team and what each is doing right now. */
function syncCast(draft: ChoreographyState, input: ChoreographyInput, now: number): void {
  const ctx = trackContext(draft, input)
  const onTeam = new Set(input.cast.map((member) => member.id))
  for (const id of draft.tracks.keys()) {
    if (!onTeam.has(id)) {
      draft.tracks.delete(id)
    }
  }
  for (const member of input.cast) {
    const track = draft.tracks.get(member.id) ?? homeTrack(member.id)
    draft.tracks.set(member.id, track)
    if (input.reducedMotion || !walksTheFloor(member)) {
      sendHome(track)
    }
    if (member.activity === 'idle' && !input.reducedMotion) {
      track.idleSince ??= now
    } else {
      track.idleSince = null
      endBreak(ctx, track, now)
    }
  }
  if (input.reducedMotion) {
    draft.effects = draft.effects.filter((effect) => effect.show.kind !== 'envelope')
    draft.meetings = []
  }
}

/**
 * Queues the intents of events not seen before. Beats start in sequence order, a stagger apart,
 * timed from when each event reached this client: a host's own timestamps schedule nothing.
 */
function takeIn(draft: ChoreographyState, live: readonly TeamActivityEntry[]): void {
  for (const entry of live) {
    if (draft.seen.has(entry.event.id)) {
      continue
    }
    const intent = floorIntent(entry.event)
    if (!intent) {
      continue
    }
    const waiting = draft.pending.findLastIndex((beat) => beat.intent.kind === 'dispatch')
    const fanOut = waiting === -1 ? undefined : draft.pending[waiting]
    if (intent.kind === 'dispatch' && fanOut?.intent.kind === 'dispatch') {
      // Dispatches that go out together are one beat, so they become one meeting.
      const assigneeIds = [...new Set([...fanOut.intent.assigneeIds, ...intent.assigneeIds])]
      draft.pending[waiting] = { ...fanOut, intent: { kind: 'dispatch', assigneeIds } }
      continue
    }
    const earliest = entry.arrivedAt + (intent.kind === 'dispatch' ? DISPATCH_GATHER_MS : 0)
    const staggered = Math.max(earliest, draft.lastBeatAt + BEAT_STAGGER_MS)
    const startAt = Math.max(draft.lastBeatAt, Math.min(staggered, earliest + MAX_BEAT_LAG_MS))
    draft.pending.push({ id: entry.event.id, startAt, intent })
    draft.lastBeatAt = startAt
  }
  draft.seen = new Set(live.map((entry) => entry.event.id))
}

function trackContext(draft: ChoreographyState, input: ChoreographyInput): TrackContext {
  const idle = new Set(
    input.cast.filter((member) => member.activity === 'idle').map((member) => member.id)
  )
  return { state: draft, walkMs: input.walkMs, isIdle: (memberId) => idle.has(memberId) }
}

function startBeat(
  draft: ChoreographyState,
  input: ChoreographyInput,
  ctx: TrackContext,
  beat: PendingBeat,
  at: number
): void {
  const plan = planBeat(beat.intent, {
    beatId: beat.id,
    cast: new Map(input.cast.map((member) => [member.id, member])),
    reducedMotion: input.reducedMotion,
    freeConferenceSeats: freeSpots(draft, conferenceAnchorId, CONFERENCE_SEATS),
    envelopesInFlight: draft.effects.filter(
      (effect) => effect.show.kind === 'envelope' && effect.startAt <= at && at < effect.endAt
    ).length,
    walkMs: (memberId, to) => {
      const track = draft.tracks.get(memberId)
      return track ? input.walkMs(track.walk?.to ?? track.at, to) : 0
    }
  })
  if (plan.meeting) {
    const { kind, lastsMs } = plan.meeting
    draft.meetings.push({ id: beat.id, kind, startAt: at, endsAt: at + lastsMs })
  }
  addEffects(draft, beat.id, plan.effects, at)
  for (const { memberId, job } of plan.errands) {
    const track = draft.tracks.get(memberId)
    if (track) {
      enqueue(ctx, track, job, at)
    }
  }
}

/** When the state next changes by itself: a beat starting, a walk or a stay ending, a break due. */
function nextTransitionAt(state: ChoreographyState): number | null {
  let due = state.pending[0]?.startAt ?? null
  for (const track of state.tracks.values()) {
    const at = trackDueAt(track)
    if (at !== null && (due === null || at < due)) {
      due = at
    }
  }
  return due
}

/** Plays every transition due by `now`, earliest first, so a coarse step ends where fine ones would. */
function settle(draft: ChoreographyState, input: ChoreographyInput, now: number): void {
  const ctx = trackContext(draft, input)
  for (let transitions = 0; transitions < MAX_TRANSITIONS_PER_STEP; transitions += 1) {
    const due = nextTransitionAt(draft)
    if (due === null || due > now) {
      return
    }
    while (draft.pending.length > 0 && draft.pending[0].startAt <= due) {
      const [beat] = draft.pending.splice(0, 1)
      startBeat(draft, input, ctx, beat, due)
    }
    for (const track of draft.tracks.values()) {
      advanceTrack(ctx, track, due)
    }
  }
}

/**
 * The floor at `now`, from the floor at an earlier moment and what has arrived since. Pure and
 * deterministic: the same states, inputs and times always give the same floor.
 */
export function stepChoreography(
  state: ChoreographyState,
  input: ChoreographyInput,
  now: number
): ChoreographyState {
  const draft = draftOf(state.epoch === input.epoch ? state : initialChoreography(input))
  if (input.hidden) {
    draft.hiddenSince ??= now
    return draft
  }
  if (draft.hiddenSince !== null) {
    if (now - draft.hiddenSince > SNAP_AFTER_HIDDEN_MS) {
      snap(draft, input.live)
    }
    draft.hiddenSince = null
  }
  syncCast(draft, input, now)
  takeIn(draft, input.live)
  settle(draft, input, now)
  draft.effects = draft.effects.filter((effect) => effect.endAt > now)
  draft.meetings = draft.meetings.filter((meeting) => meeting.endsAt > now)
  return draft
}

const AT_DESK: FloorPose = { kind: 'home' }

/** Where a member is at `now`. Anyone the state does not know is at their desk. */
export function trackAt(state: ChoreographyState, memberId: string, now: number): FloorPose {
  const track = state.tracks.get(memberId)
  if (!track) {
    return AT_DESK
  }
  const { walk } = track
  if (walk && now < walk.endsAt) {
    return { kind: 'walking', walk }
  }
  const at = walk ? walk.to : track.at
  if (at.kind === 'home' && at.memberId === memberId) {
    return AT_DESK
  }
  return { kind: 'away', at, holding: walk ? (track.job?.holding ?? null) : track.holding }
}

/**
 * The earliest moment after `now` at which the floor looks different, or null when nothing is
 * scheduled. A hidden floor schedules nothing: it moves again when it is shown.
 */
export function nextWakeAt(state: ChoreographyState, now: number): number | null {
  if (state.hiddenSince !== null) {
    return null
  }
  const transition = nextTransitionAt(state)
  const moments = [
    ...state.effects.flatMap((effect) => [effect.startAt, effect.endAt]),
    ...state.meetings.map((meeting) => meeting.endsAt)
  ].filter((moment) => moment > now)
  if (transition !== null) {
    moments.push(Math.max(transition, now))
  }
  return moments.length > 0 ? Math.min(...moments) : null
}
