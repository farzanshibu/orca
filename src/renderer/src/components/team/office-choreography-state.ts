import type { FloorCarry, FloorIntent } from './office-floor-events'
import type { FloorAnchorId } from './office-floor-plan'
import type { FloorActivity } from './office-floor-state'

/** Beats start this far apart, so a page of events reads as a sequence and not as one jolt. */
export const BEAT_STAGGER_MS = 400
// Past this the stagger gives way: a long backlog starts together and the queue caps collapse it.
export const MAX_BEAT_LAG_MS = 6_000
// A dispatch waits this long for the others of its fan-out, which can land a poll later.
export const DISPATCH_GATHER_MS = 1_200
/** Longer than this out of sight and nothing is caught up: everyone is put where they belong. */
export const SNAP_AFTER_HIDDEN_MS = 5_000
/** Errands one character holds at a time, the one under way included. */
export const MAX_QUEUED_JOBS = 3
export const MAX_ENVELOPES_IN_FLIGHT = 16
export const KITCHEN_BREAK_AFTER_MS = 45_000
export const CONFERENCE_SEATS = 8
export const KITCHEN_SPOTS = 3

/**
 * Somewhere a character can be: at its own desk, standing beside someone else's, or at one of the
 * plan's anchors. Geometry is the plan's business; the choreography only names places.
 */
export type FloorPlace =
  | { kind: 'home'; memberId: string }
  | { kind: 'beside'; memberId: string }
  | { kind: 'spot'; anchor: FloorAnchorId }

export function placeKey(place: FloorPlace): string {
  return place.kind === 'spot' ? place.anchor : `${place.kind}:${place.memberId}`
}

export function samePlace(a: FloorPlace, b: FloorPlace): boolean {
  return placeKey(a) === placeKey(b)
}

export type FloorBadgeKind = 'mail' | 'ticket'
export type FloorMeetingKind = 'kickoff' | 'gathering'

/** Something on the floor that is not a character. */
export type FloorEffectShow =
  | { kind: 'envelope'; fromId: string; toId: string; tint: string | null }
  | { kind: 'badge'; memberId: string; badge: FloorBadgeKind }
  /** A note on the reception tray. */
  | { kind: 'note' }
  /** A box set down at the loading dock. */
  | { kind: 'box' }

/** An effect as a rule asks for it: timed from the moment the rule's beat, or errand, happens. */
export type FloorEffectDraft = {
  show: FloorEffectShow
  afterMs: number
  lastsMs: number
  /** Names the effect within its beat, so an errand of that beat can pick it up. */
  key?: string
}

export type FloorEffect = { id: string; startAt: number; endAt: number; show: FloorEffectShow }

/** The id of an effect of beat or errand `ownerId`: its key, or its place among that owner's effects. */
export function effectId(ownerId: string, key: string | number): string {
  return `${ownerId}:${key}`
}

/** One trip: go somewhere, stay a moment, then on to the next trip or back to the desk. */
export type FloorJob = {
  id: string
  to: FloorPlace
  /** In hand on the way there. */
  carrying: FloorCarry | null
  /** In hand from arrival on, the walk away included. */
  holding: FloorCarry | null
  stayMs: number
  /** The meeting this trip attends; it does not leave before the meeting ends. */
  meetingId: string | null
  /** Shown from the moment of arrival. */
  arrive: readonly FloorEffectDraft[]
  /** The effect this trip picks up on arrival, which ends it. */
  takes: string | null
  /** A kitchen break: it has no end of its own, work ends it. */
  rest: boolean
}

export type FloorWalk = {
  from: FloorPlace
  to: FloorPlace
  startedAt: number
  endsAt: number
  carrying: FloorCarry | null
}

/** One character's place and errands. A character with no walk and no job is at its desk. */
export type FloorTrack = {
  memberId: string
  /** Where it is while it is not walking. */
  at: FloorPlace
  walk: FloorWalk | null
  /** The errand it is walking to or staying at; null on the walk home. */
  job: FloorJob | null
  /** When its stay ends; null until it arrives. */
  stayUntil: number | null
  holding: FloorCarry | null
  queue: FloorJob[]
  /** Errands that found the queue full: the "+N" on the character. */
  overflow: number
  /** Since when it has been idle at its desk; null while it is anything else. */
  idleSince: number | null
}

export type FloorMeeting = { id: string; kind: FloorMeetingKind; startAt: number; endsAt: number }

/** An intent waiting for its turn to start. */
export type PendingBeat = { id: string; startAt: number; intent: FloorIntent }

export type ChoreographyState = {
  epoch: number
  /** Ids of the live events already taken in. */
  seen: ReadonlySet<string>
  /** When the latest beat starts, or started. */
  lastBeatAt: number
  /** In start order, which is sequence order. */
  pending: PendingBeat[]
  tracks: Map<string, FloorTrack>
  effects: FloorEffect[]
  meetings: FloorMeeting[]
  hiddenSince: number | null
}

export type FloorCastMember = { id: string; manager: boolean; activity: FloorActivity }

/** Where a character is at one moment. */
export type FloorPose =
  | { kind: 'home' }
  | { kind: 'walking'; walk: FloorWalk }
  | { kind: 'away'; at: FloorPlace; holding: FloorCarry | null }

export function homeOf(memberId: string): FloorPlace {
  return { kind: 'home', memberId }
}

export function homeTrack(memberId: string): FloorTrack {
  return {
    memberId,
    at: homeOf(memberId),
    walk: null,
    job: null,
    stayUntil: null,
    holding: null,
    queue: [],
    overflow: 0,
    idleSince: null
  }
}

/** Present and verifiable. A stopped, paused or unverifiable member is never shown leaving its desk. */
export function walksTheFloor(member: FloorCastMember | undefined): member is FloorCastMember {
  return member !== undefined && member.activity !== 'off' && member.activity !== 'unverifiable'
}

/** On the floor at all: an unverifiable member keeps its seat, so a badge can still land on it. */
export function isOnTheFloor(member: FloorCastMember | undefined): member is FloorCastMember {
  return member !== undefined && member.activity !== 'off'
}
