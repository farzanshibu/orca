import type { TeamActivityEvent } from '../../../../shared/team-activity-event'
import { stepChoreography, type ChoreographyInput } from './office-choreography'
import { floorScene, type FloorScene } from './office-choreography-scene'
import type { ChoreographyState, FloorCastMember } from './office-choreography-state'
import type { FloorActivity } from './office-floor-state'
import type { TeamActivityEntry } from './team-activity-merge'
import { makeTeamActivityEvent } from './team-activity-test-fixtures'

/** Every walk in these tests takes this long, whatever its ends. */
export const TEST_WALK_MS = 1_000

export function castMember(
  id: string,
  activity: FloorActivity = 'idle',
  manager = false
): FloorCastMember {
  return { id, manager, activity }
}

/** A live entry that reached the client at `arrivedAt`. */
export function liveEntry(
  sequence: number,
  arrivedAt: number,
  overrides: Partial<TeamActivityEvent> = {}
): TeamActivityEntry {
  return { event: makeTeamActivityEvent(sequence, overrides), history: false, arrivedAt }
}

export function dispatchEntry(
  sequence: number,
  arrivedAt: number,
  assigneeId: string
): TeamActivityEntry {
  return liveEntry(sequence, arrivedAt, {
    kind: 'dispatch_started',
    message_type: null,
    from: { party: 'member', member_id: 'lead' },
    to: { party: 'member', member_ids: [assigneeId] }
  })
}

export function mailEntry(
  sequence: number,
  arrivedAt: number,
  fromId: string,
  toIds: string[],
  messageType = 'handoff'
): TeamActivityEntry {
  return liveEntry(sequence, arrivedAt, {
    message_type: messageType,
    from: { party: 'member', member_id: fromId },
    to: { party: 'member', member_ids: toIds }
  })
}

export function choreographyInput(overrides: Partial<ChoreographyInput> = {}): ChoreographyInput {
  return {
    epoch: 1,
    live: [],
    cast: [],
    reducedMotion: false,
    hidden: false,
    walkMs: () => TEST_WALK_MS,
    ...overrides
  }
}

export type PlayedFrame = { at: number; state: ChoreographyState; scene: FloorScene }

/** Steps from `from` to `to` in `everyMs` increments, keeping every frame on the way. */
export function play(
  state: ChoreographyState,
  input: ChoreographyInput,
  from: number,
  to: number,
  everyMs = 100
): PlayedFrame[] {
  const frames: PlayedFrame[] = []
  let current = state
  for (let at = from; at <= to; at += everyMs) {
    current = stepChoreography(current, input, at)
    frames.push({ at, state: current, scene: floorScene(current, at) })
  }
  return frames
}
