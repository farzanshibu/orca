import { initialChoreography, trackAt } from './office-choreography'
import {
  placeKey,
  type ChoreographyState,
  type FloorBadgeKind,
  type FloorEffect,
  type FloorEffectShow,
  type FloorMeetingKind,
  type FloorPose
} from './office-choreography-state'

export type FloorAwayPose = Exclude<FloorPose, { kind: 'home' }>

export type FloorEnvelope = FloorEffect & { show: Extract<FloorEffectShow, { kind: 'envelope' }> }

/** What the floor draws at one moment, on top of everyone sitting at their desks. */
export type FloorScene = {
  /** Members who are not at their desks. Anyone missing from it is. */
  poses: ReadonlyMap<string, FloorAwayPose>
  envelopes: readonly FloorEnvelope[]
  /** Notes on the reception tray, oldest first. */
  notes: readonly FloorEffect[]
  /** Boxes set down at the dock, oldest first. */
  boxes: readonly FloorEffect[]
  /** One badge a member; a ticket outranks mail. */
  badges: ReadonlyMap<string, FloorBadgeKind>
  /** Errands a member's full queue turned away: its "+N". */
  overflow: ReadonlyMap<string, number>
  /** The meeting in progress, if any. */
  meeting: FloorMeetingKind | null
  /** Changes whenever anything above does, so an unchanged scene can be told without comparing it. */
  key: string
}

function isEnvelope(effect: FloorEffect): effect is FloorEnvelope {
  return effect.show.kind === 'envelope'
}

function poseKey(memberId: string, pose: FloorAwayPose): string {
  return pose.kind === 'walking'
    ? `${memberId}>${placeKey(pose.walk.from)}>${placeKey(pose.walk.to)}@${pose.walk.startedAt}`
    : `${memberId}@${placeKey(pose.at)}:${pose.holding ?? ''}`
}

export function floorScene(state: ChoreographyState, now: number): FloorScene {
  const poses = new Map<string, FloorAwayPose>()
  const overflow = new Map<string, number>()
  for (const [memberId, track] of state.tracks) {
    const pose = trackAt(state, memberId, now)
    if (pose.kind !== 'home') {
      poses.set(memberId, pose)
    }
    if (track.overflow > 0) {
      overflow.set(memberId, track.overflow)
    }
  }
  const showing = state.effects.filter((effect) => effect.startAt <= now && now < effect.endAt)
  const badges = new Map<string, FloorBadgeKind>()
  for (const { show } of showing) {
    if (show.kind === 'badge' && badges.get(show.memberId) !== 'ticket') {
      badges.set(show.memberId, show.badge)
    }
  }
  const meetings = state.meetings.filter(({ startAt, endsAt }) => startAt <= now && now < endsAt)
  const meeting = meetings.find(({ kind }) => kind === 'kickoff')?.kind ?? meetings[0]?.kind ?? null
  const key = [
    [...poses].map(([memberId, pose]) => poseKey(memberId, pose)).join(','),
    showing.map((effect) => effect.id).join(','),
    [...badges].map(([memberId, badge]) => `${memberId}:${badge}`).join(','),
    [...overflow].map(([memberId, count]) => `${memberId}+${count}`).join(','),
    meeting ?? ''
  ].join('|')
  return {
    poses,
    envelopes: showing.filter(isEnvelope),
    notes: showing.filter((effect) => effect.show.kind === 'note'),
    boxes: showing.filter((effect) => effect.show.kind === 'box'),
    badges,
    overflow,
    meeting,
    key
  }
}

/** Everyone at their desks and nothing else going on. */
export const EMPTY_FLOOR_SCENE = floorScene(initialChoreography({ epoch: 0, live: [] }), 0)
