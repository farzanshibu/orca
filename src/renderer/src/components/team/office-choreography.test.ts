import { describe, expect, it } from 'vitest'
import { initialChoreography, nextWakeAt, stepChoreography, trackAt } from './office-choreography'
import { EMPTY_FLOOR_SCENE, floorScene } from './office-choreography-scene'
import {
  BEAT_STAGGER_MS,
  DISPATCH_GATHER_MS,
  KITCHEN_BREAK_AFTER_MS,
  MAX_ENVELOPES_IN_FLIGHT,
  MAX_QUEUED_JOBS,
  SNAP_AFTER_HIDDEN_MS,
  placeKey,
  type ChoreographyState
} from './office-choreography-state'
import {
  TEST_WALK_MS,
  castMember,
  choreographyInput,
  dispatchEntry,
  liveEntry,
  mailEntry,
  play,
  type PlayedFrame
} from './office-choreography-test-fixtures'

const TEAM = [
  castMember('lead', 'idle', true),
  castMember('ada'),
  castMember('bo'),
  castMember('cy')
]

const EMPTY = initialChoreography({ epoch: 1, live: [] })

function poseAt(frame: PlayedFrame, memberId: string): string {
  const pose = trackAt(frame.state, memberId, frame.at)
  if (pose.kind === 'home') {
    return 'home'
  }
  return pose.kind === 'walking' ? `walking>${placeKey(pose.walk.to)}` : placeKey(pose.at)
}

function everyPose(frames: readonly PlayedFrame[], memberId: string): string[] {
  return [...new Set(frames.map((frame) => poseAt(frame, memberId)))]
}

function heldJobs(state: ChoreographyState, memberId: string): number {
  const track = state.tracks.get(memberId)
  return track ? track.queue.length + (track.job ? 1 : 0) : 0
}

describe('office choreography: dispatches', () => {
  it('turns a fan-out of three dispatches into exactly one kickoff meeting', () => {
    const live = [
      dispatchEntry(1, 1_000, 'ada'),
      dispatchEntry(2, 1_000, 'bo'),
      dispatchEntry(3, 1_000, 'cy')
    ]
    const frames = play(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000, 12_000)

    const meetings = new Set(frames.flatMap((frame) => frame.state.meetings.map(({ id }) => id)))
    expect(meetings.size).toBe(1)
    expect(new Set(frames.map((frame) => frame.scene.meeting))).toEqual(new Set([null, 'kickoff']))

    const seated = frames.find((frame) => frame.at === 1_000 + DISPATCH_GATHER_MS + TEST_WALK_MS)
    expect(seated && poseAt(seated, 'lead')).toBe('whiteboard')
    expect(seated && ['ada', 'bo', 'cy'].map((id) => poseAt(seated, id))).toEqual([
      'conference:0',
      'conference:1',
      'conference:2'
    ])
    // Then everyone walks back, ticket in hand, and sits down.
    const leaving = frames.find((frame) => poseAt(frame, 'ada') === 'walking>home:ada')
    const walkHome = leaving && trackAt(leaving.state, 'ada', leaving.at)
    expect(walkHome?.kind === 'walking' && walkHome.walk.carrying).toBe('ticket')
    expect(['lead', 'ada', 'bo', 'cy'].map((id) => poseAt(frames.at(-1)!, id))).toEqual([
      'home',
      'home',
      'home',
      'home'
    ])
  })

  it('still holds one meeting when the fan-out is split across two polls', () => {
    const live = [dispatchEntry(1, 1_000, 'ada'), dispatchEntry(2, 1_900, 'bo')]
    const first = stepChoreography(EMPTY, choreographyInput({ cast: TEAM, live: [live[0]] }), 1_000)
    const frames = play(first, choreographyInput({ cast: TEAM, live }), 1_900, 12_000)

    expect(new Set(frames.flatMap((frame) => frame.state.meetings.map(({ id }) => id))).size).toBe(
      1
    )
    expect(everyPose(frames, 'ada')).toContain('conference:0')
    expect(everyPose(frames, 'bo')).toContain('conference:1')
  })

  it('keeps the assignees in the meeting even though the dispatch has put them to work', () => {
    const working = [
      castMember('lead', 'working', true),
      castMember('ada', 'working'),
      castMember('bo', 'working')
    ]
    const live = [dispatchEntry(1, 1_000, 'ada'), dispatchEntry(2, 1_000, 'bo')]
    const frames = play(EMPTY, choreographyInput({ cast: working, live }), 1_000, 6_000)

    expect(everyPose(frames, 'lead')).toContain('whiteboard')
    expect(everyPose(frames, 'ada')).toContain('conference:0')
  })

  it('sends a lone idle assignee to the whiteboard for its ticket, with no meeting', () => {
    const live = [dispatchEntry(1, 1_000, 'ada')]
    const frames = play(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000, 8_000)

    expect(frames.every((frame) => frame.scene.meeting === null)).toBe(true)
    expect(everyPose(frames, 'ada')).toEqual([
      'home',
      'walking>whiteboard',
      'whiteboard',
      'walking>home:ada'
    ])
    expect(everyPose(frames, 'lead')).toEqual(['home'])
  })

  it('leaves a lone working assignee at its desk with a ticket badge', () => {
    const cast = [castMember('lead', 'idle', true), castMember('ada', 'working')]
    const live = [dispatchEntry(1, 1_000, 'ada')]
    const frames = play(EMPTY, choreographyInput({ cast, live }), 1_000, 4_000)

    expect(everyPose(frames, 'ada')).toEqual(['home'])
    expect(frames.some((frame) => frame.scene.badges.get('ada') === 'ticket')).toBe(true)
  })

  it('never walks an unverifiable or stopped member anywhere', () => {
    const cast = [
      castMember('lead', 'idle', true),
      castMember('ada', 'unverifiable'),
      castMember('bo', 'off'),
      castMember('cy')
    ]
    const live = [
      dispatchEntry(1, 1_000, 'ada'),
      dispatchEntry(2, 1_000, 'bo'),
      mailEntry(3, 1_000, 'ada', ['cy'])
    ]
    const frames = play(EMPTY, choreographyInput({ cast, live }), 1_000, 8_000)

    expect(everyPose(frames, 'ada')).toEqual(['home'])
    expect(everyPose(frames, 'bo')).toEqual(['home'])
    // The unverifiable member keeps its seat, so its ticket and its mail still show up.
    expect(frames.some((frame) => frame.scene.badges.get('ada') === 'ticket')).toBe(true)
    expect(frames.some((frame) => frame.scene.badges.get('bo'))).toBe(false)
    expect(frames.some((frame) => frame.scene.badges.get('cy') === 'mail')).toBe(true)
  })
})

describe('office choreography: mail', () => {
  it('walks an idle sender to the recipient with a folder, and badges a working recipient only', () => {
    const cast = [castMember('ada'), castMember('bo', 'working')]
    const live = [mailEntry(1, 1_000, 'ada', ['bo'], 'worker_done')]
    const frames = play(EMPTY, choreographyInput({ cast, live }), 1_000, 5_000)

    expect(everyPose(frames, 'bo')).toEqual(['home'])
    expect(everyPose(frames, 'ada')).toEqual([
      'walking>beside:bo',
      'beside:bo',
      'walking>home:ada',
      'home'
    ])
    const onTheWay = trackAt(frames[1].state, 'ada', frames[1].at)
    expect(onTheWay.kind === 'walking' && onTheWay.walk.carrying).toBe('folder')
    // The badge lands with the folder, not before.
    const badged = frames.find((frame) => frame.scene.badges.get('bo') === 'mail')
    expect(badged?.at).toBe(1_000 + TEST_WALK_MS)
  })

  it('flies an envelope instead when the sender is working', () => {
    const cast = [castMember('ada', 'working'), castMember('bo')]
    const live = [mailEntry(1, 1_000, 'ada', ['bo'], 'status')]
    const frames = play(EMPTY, choreographyInput({ cast, live }), 1_000, 3_000)

    expect(everyPose(frames, 'ada')).toEqual(['home'])
    expect(
      frames[0].scene.envelopes.map(({ show }) => [show.fromId, show.toId, show.tint])
    ).toEqual([['ada', 'bo', 'status']])
    expect(frames[0].scene.badges.has('bo')).toBe(false)
    expect(frames.at(-1)?.scene.envelopes).toEqual([])
    expect(frames.at(-1)?.scene.badges.get('bo')).toBe('mail')
  })

  it(`never has more than ${MAX_ENVELOPES_IN_FLIGHT} envelopes in the air`, () => {
    const recipients = Array.from({ length: 20 }, (_, index) => `m${index}`)
    const cast = [castMember('ada', 'working'), ...recipients.map((id) => castMember(id))]
    const live = [
      mailEntry(1, 1_000, 'ada', recipients, 'status'),
      mailEntry(2, 1_000, 'ada', ['m0'])
    ]
    const frames = play(EMPTY, choreographyInput({ cast, live }), 1_000, 4_000)

    expect(Math.max(...frames.map((frame) => frame.scene.envelopes.length))).toBe(
      MAX_ENVELOPES_IN_FLIGHT
    )
    // Mail that found the air full still arrives.
    expect(recipients.every((id) => frames.some((frame) => frame.scene.badges.has(id)))).toBe(true)
  })

  it('gathers the people of a group message in the conference room, minus whoever is working', () => {
    const cast = [
      castMember('ada'),
      castMember('bo', 'working'),
      castMember('cy'),
      castMember('di')
    ]
    const live = [mailEntry(1, 1_000, 'ada', ['bo', 'cy', 'di'], 'status')]
    const frames = play(EMPTY, choreographyInput({ cast, live }), 1_000, 9_000)

    expect(frames.some((frame) => frame.scene.meeting === 'gathering')).toBe(true)
    expect(['ada', 'cy', 'di'].map((id) => everyPose(frames, id)[1])).toEqual([
      'conference:0',
      'conference:1',
      'conference:2'
    ])
    expect(everyPose(frames, 'bo')).toEqual(['home'])
    expect(frames[0].scene.badges.get('bo')).toBe('mail')
    expect(frames.at(-1)?.scene.poses.size).toBe(0)
  })

  it('puts a note at reception for the human and moves nobody', () => {
    const live = [
      liveEntry(1, 1_000, {
        kind: 'gate_opened',
        from: { party: 'member', member_id: 'ada' },
        to: { party: 'operator', member_ids: [] }
      }),
      liveEntry(2, 1_000, {
        message_type: 'question',
        from: { party: 'member', member_id: 'bo' },
        to: { party: 'member', member_ids: ['lead'] }
      }),
      liveEntry(3, 1_000, {
        kind: 'hire_proposed',
        from: { party: 'member', member_id: 'lead' },
        to: { party: 'operator', member_ids: [] }
      })
    ]
    const frames = play(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000, 3_000)

    expect(
      frames.find((frame) => frame.at === 1_000 + 2 * BEAT_STAGGER_MS)?.scene.notes
    ).toHaveLength(3)
    expect(frames.every((frame) => frame.scene.poses.size === 0)).toBe(true)
  })
})

describe('office choreography: goals and finished work', () => {
  it('lands a goal note at reception and has the manager fetch it', () => {
    const live = [
      liveEntry(1, 1_000, {
        kind: 'goal_created',
        from: { party: 'operator', member_id: null },
        to: { party: 'team', member_ids: [] }
      })
    ]
    const frames = play(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000, 5_000)

    expect(frames[0].scene.notes).toHaveLength(1)
    expect(everyPose(frames, 'lead')).toEqual([
      'walking>reception',
      'reception',
      'walking>home:lead',
      'home'
    ])
    // The note leaves the tray in the manager's hand.
    const arrived = frames.find((frame) => poseAt(frame, 'lead') === 'reception')
    expect(arrived?.scene.notes).toEqual([])
    const back = frames.find((frame) => poseAt(frame, 'lead') === 'walking>home:lead')
    const walk = back && trackAt(back.state, 'lead', back.at)
    expect(walk?.kind === 'walking' && walk.walk.carrying).toBe('note')
  })

  it('has the owner of a finished task carry a box to the dock', () => {
    const live = [
      liveEntry(1, 1_000, {
        kind: 'task_settled',
        status: 'completed',
        from: { party: 'member', member_id: 'ada' },
        to: { party: 'member', member_ids: ['lead'] }
      })
    ]
    const frames = play(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000, 5_000)

    const leaving = trackAt(frames[1].state, 'ada', frames[1].at)
    expect(
      leaving.kind === 'walking' && [placeKey(leaving.walk.to), leaving.walk.carrying]
    ).toEqual(['dock', 'box'])
    expect(frames[1].scene.boxes).toEqual([])
    expect(frames.find((frame) => poseAt(frame, 'ada') === 'dock')?.scene.boxes).toHaveLength(1)
    expect(poseAt(frames.at(-1)!, 'ada')).toBe('home')
  })

  it('carries no box for a task that failed', () => {
    const live = [
      liveEntry(1, 1_000, {
        kind: 'task_settled',
        status: 'failed',
        from: { party: 'member', member_id: 'ada' }
      })
    ]
    const frames = play(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000, 3_000)

    expect(
      frames.every((frame) => frame.scene.poses.size === 0 && frame.scene.boxes.length === 0)
    ).toBe(true)
  })
})

describe('office choreography: what is never acted out', () => {
  it('produces no beats from what the feed already held', () => {
    const live = [
      dispatchEntry(1, 0, 'ada'),
      dispatchEntry(2, 0, 'bo'),
      mailEntry(3, 0, 'ada', ['bo'])
    ]
    const input = choreographyInput({ cast: TEAM, live })
    const frames = play(initialChoreography(input), input, 1_000, 6_000)

    expect(frames.every((frame) => frame.state.pending.length === 0)).toBe(true)
    expect(frames.every((frame) => frame.scene.key === EMPTY_FLOOR_SCENE.key)).toBe(true)
  })

  it('ignores kinds it does not know, and kinds that change nothing on the floor', () => {
    const live = [
      liveEntry(1, 1_000, { kind: 'budget_alert', status: 'over_limit' }),
      liveEntry(2, 1_000, { kind: 'task_created' }),
      liveEntry(3, 1_000, { kind: 'delivery', channel: 'mailbox', status: 'read' }),
      liveEntry(4, 1_000, { kind: 'member_paused' })
    ]
    const frames = play(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000, 3_000)

    expect(frames.every((frame) => frame.state.pending.length === 0)).toBe(true)
    expect(frames.every((frame) => frame.scene.key === EMPTY_FLOOR_SCENE.key)).toBe(true)
  })

  it('drops everything it derived when the feed is replaced', () => {
    const live = [mailEntry(1, 1_000, 'ada', ['bo']), mailEntry(2, 1_000, 'bo', ['cy'])]
    const busy = stepChoreography(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000)
    expect(floorScene(busy, 1_000).poses.has('ada')).toBe(true)
    expect(busy.pending).toHaveLength(1)

    // Another team or host: the old feed's events come back as part of a new one.
    const replaced = stepChoreography(
      busy,
      choreographyInput({ cast: TEAM, live, epoch: 2 }),
      1_100
    )
    expect(replaced.epoch).toBe(2)
    expect(replaced.pending).toEqual([])
    expect(replaced.effects).toEqual([])
    expect(floorScene(replaced, 1_100).poses.size).toBe(0)
  })
})

describe('office choreography: timing', () => {
  it('starts beats in sequence order from client arrival, whatever the host clock said', () => {
    const live = [
      mailEntry(1, 1_000, 'ada', ['bo']),
      mailEntry(2, 1_000, 'bo', ['cy']),
      mailEntry(3, 1_000, 'cy', ['ada'])
    ]
    // The host stamps them backwards, and decades away from the client's clock.
    live[0].event.created_at = '2040-01-01T00:00:03.000Z'
    live[1].event.created_at = '2040-01-01T00:00:02.000Z'
    live[2].event.created_at = '1999-01-01T00:00:00.000Z'
    const frames = play(EMPTY, choreographyInput({ cast: TEAM, live }), 1_000, 2_000)

    const firstLeft = (id: string): number | undefined =>
      frames.find((frame) => frame.scene.poses.has(id))?.at
    expect([firstLeft('ada'), firstLeft('bo'), firstLeft('cy')]).toEqual([
      1_000,
      1_000 + BEAT_STAGGER_MS,
      1_000 + 2 * BEAT_STAGGER_MS
    ])
  })

  it('ends in the same place whether it is stepped finely or in one go', () => {
    const live = [
      dispatchEntry(1, 1_000, 'ada'),
      dispatchEntry(2, 1_000, 'bo'),
      mailEntry(3, 1_000, 'cy', ['ada']),
      mailEntry(4, 1_000, 'ada', ['cy'], 'worker_done')
    ]
    const input = choreographyInput({ cast: TEAM, live })
    const fine = play(EMPTY, input, 1_000, 7_300, 50).at(-1)
    const coarse = stepChoreography(stepChoreography(EMPTY, input, 1_000), input, 7_300)

    expect(coarse).toEqual(fine?.state)
  })

  it('collapses a backlog to three errands and a "+N"', () => {
    const recipients = ['bo', 'cy', 'di', 'ed', 'fi', 'gus', 'hal', 'ivy', 'jo', 'kit']
    const cast = [castMember('ada'), ...recipients.map((id) => castMember(id, 'working'))]
    const live = recipients.map((id, index) => mailEntry(index + 1, 1_000, 'ada', [id]))
    const input = choreographyInput({ cast, live, walkMs: () => 4_000 })
    const frames = play(EMPTY, input, 1_000, 5_000)

    expect(Math.max(...frames.map((frame) => heldJobs(frame.state, 'ada')))).toBe(MAX_QUEUED_JOBS)
    const afterBurst = frames.find((frame) => frame.at === 1_000 + 9 * BEAT_STAGGER_MS)
    expect(afterBurst?.scene.overflow.get('ada')).toBe(recipients.length - MAX_QUEUED_JOBS)
    // What the skipped trips would have delivered is on the desks all the same.
    expect(recipients.slice(MAX_QUEUED_JOBS).every((id) => afterBurst?.scene.badges.has(id))).toBe(
      true
    )
    // The count clears once the queue has been walked off.
    const done = play(frames.at(-1)!.state, input, 5_100, 40_000, 500).at(-1)
    expect(done?.scene.overflow.size).toBe(0)
    expect(done?.scene.poses.size).toBe(0)
  })

  it('snaps everyone home after more than five seconds out of sight', () => {
    const before = [mailEntry(1, 1_000, 'ada', ['bo'])]
    const during = [...before, dispatchEntry(2, 3_000, 'cy'), mailEntry(3, 4_000, 'bo', ['cy'])]
    const walking = stepChoreography(EMPTY, choreographyInput({ cast: TEAM, live: before }), 1_100)
    const hidden = stepChoreography(
      walking,
      choreographyInput({ cast: TEAM, live: before, hidden: true }),
      1_200
    )
    expect(nextWakeAt(hidden, 1_200)).toBeNull()

    const shownAt = 1_200 + SNAP_AFTER_HIDDEN_MS + 1
    const frames = play(
      hidden,
      choreographyInput({ cast: TEAM, live: during }),
      shownAt,
      shownAt + 4_000
    )

    // No catch-up: what arrived meanwhile is taken as seen, and nobody is anywhere but home.
    expect(frames.every((frame) => frame.scene.key === EMPTY_FLOOR_SCENE.key)).toBe(true)
    expect(frames[0].state.pending).toEqual([])
  })

  it('carries on where it was after a short absence', () => {
    const live = [mailEntry(1, 1_000, 'ada', ['bo'])]
    const walking = stepChoreography(EMPTY, choreographyInput({ cast: TEAM, live }), 1_100)
    const hidden = stepChoreography(
      walking,
      choreographyInput({ cast: TEAM, live, hidden: true }),
      1_200
    )
    const shown = stepChoreography(
      hidden,
      choreographyInput({ cast: TEAM, live }),
      1_200 + SNAP_AFTER_HIDDEN_MS
    )

    // Time went on while it was hidden: the walk there, the handover and the walk back are all done.
    expect(trackAt(shown, 'ada', 1_200 + SNAP_AFTER_HIDDEN_MS)).toEqual({ kind: 'home' })
    expect(floorScene(shown, 1_200 + SNAP_AFTER_HIDDEN_MS).badges.get('bo')).toBe('mail')
  })

  it('wakes for the next change and for nothing else', () => {
    const live = [mailEntry(1, 1_000, 'ada', ['bo'])]
    const input = choreographyInput({
      cast: [castMember('ada', 'waiting'), castMember('bo', 'working')],
      live
    })
    const state = stepChoreography(EMPTY, input, 1_000)

    expect(nextWakeAt(state, 1_000)).toBe(1_000 + TEST_WALK_MS)
    const settled = play(state, input, 1_100, 20_000).at(-1)
    expect(settled && nextWakeAt(settled.state, settled.at)).toBeNull()
  })
})

describe('office choreography: kitchen break', () => {
  const BREAK_AT = KITCHEN_BREAK_AFTER_MS

  it('walks an idle member to the kitchen after 45 seconds, and back when work arrives', () => {
    const idle = choreographyInput({ cast: [castMember('ada')] })
    const frames = play(EMPTY, idle, 0, BREAK_AT + 5_000, 500)

    expect(
      poseAt(
        frames.find((frame) => frame.at === BREAK_AT - 500)!,
        'ada'
      )
    ).toBe('home')
    expect(
      poseAt(
        frames.find((frame) => frame.at === BREAK_AT)!,
        'ada'
      )
    ).toBe('walking>kitchen:0')
    expect(poseAt(frames.at(-1)!, 'ada')).toBe('kitchen:0')

    const working = choreographyInput({ cast: [castMember('ada', 'working')] })
    const back = play(frames.at(-1)!.state, working, BREAK_AT + 5_500, BREAK_AT + 7_000, 500)
    expect(poseAt(back[0], 'ada')).toBe('walking>home:ada')
    expect(poseAt(back.at(-1)!, 'ada')).toBe('home')
  })

  it('has room for three, and leaves the fourth at their desk', () => {
    const cast = ['ada', 'bo', 'cy', 'di'].map((id) => castMember(id))
    const last = play(EMPTY, choreographyInput({ cast }), 0, BREAK_AT + 2_000, 500).at(-1)!

    expect(['ada', 'bo', 'cy', 'di'].map((id) => poseAt(last, id))).toEqual([
      'kitchen:0',
      'kitchen:1',
      'kitchen:2',
      'home'
    ])
  })

  it('never leaves when work arrives inside the 45 seconds', () => {
    const idle = choreographyInput({ cast: [castMember('ada')] })
    const working = choreographyInput({ cast: [castMember('ada', 'working')] })
    const waited = play(EMPTY, idle, 0, 30_000, 1_000).at(-1)!
    const busy = play(waited.state, working, 31_000, BREAK_AT + 20_000, 1_000)
    expect(everyPose(busy, 'ada')).toEqual(['home'])

    // Idle again: the 45 seconds start over from here.
    const idleAgainAt = BREAK_AT + 21_000
    const later = play(busy.at(-1)!.state, idle, idleAgainAt, idleAgainAt + BREAK_AT, 1_000)
    expect(poseAt(later.at(-2)!, 'ada')).toBe('home')
    expect(poseAt(later.at(-1)!, 'ada')).toBe('walking>kitchen:0')
  })

  it('turns round on the way when work arrives, and is back after the time already walked', () => {
    const idle = choreographyInput({ cast: [castMember('ada')] })
    const working = choreographyInput({ cast: [castMember('ada', 'working')] })
    const onTheWay = stepChoreography(stepChoreography(EMPTY, idle, 0), idle, BREAK_AT + 400)
    expect(trackAt(onTheWay, 'ada', BREAK_AT + 400).kind).toBe('walking')

    const turned = stepChoreography(onTheWay, working, BREAK_AT + 400)
    const pose = trackAt(turned, 'ada', BREAK_AT + 400)
    expect(pose.kind === 'walking' && [placeKey(pose.walk.to), pose.walk.endsAt]).toEqual([
      'home:ada',
      BREAK_AT + 800
    ])
    // Its walk back began as far into the route as it had come: no jump.
    expect(pose.kind === 'walking' && pose.walk.startedAt).toBe(
      BREAK_AT + 400 - (TEST_WALK_MS - 400)
    )
    expect(
      trackAt(stepChoreography(turned, working, BREAK_AT + 800), 'ada', BREAK_AT + 800)
    ).toEqual({
      kind: 'home'
    })
  })

  it('goes straight from the kitchen to an errand that comes up', () => {
    const cast = [castMember('lead', 'working', true), castMember('ada')]
    const resting = play(EMPTY, choreographyInput({ cast }), 0, BREAK_AT + 2_000, 500).at(-1)!
    expect(poseAt(resting, 'ada')).toBe('kitchen:0')

    const live = [dispatchEntry(1, resting.at + 500, 'ada')]
    const frames = play(
      resting.state,
      choreographyInput({ cast, live }),
      resting.at + 500,
      resting.at + 8_000
    )
    expect(everyPose(frames, 'ada')).toEqual([
      'kitchen:0',
      'walking>whiteboard',
      'whiteboard',
      'walking>home:ada',
      'home'
    ])
  })
})

describe('office choreography: reduced motion', () => {
  it('has no walk, meeting or envelope beats, only what appears in place', () => {
    const cast = [...TEAM, castMember('di', 'working')]
    const live = [
      dispatchEntry(1, 1_000, 'ada'),
      dispatchEntry(2, 1_000, 'bo'),
      mailEntry(3, 1_000, 'cy', ['ada']),
      mailEntry(4, 1_000, 'di', ['cy'], 'status'),
      mailEntry(5, 1_000, 'ada', ['bo', 'cy', 'lead'], 'status'),
      liveEntry(6, 1_000, { kind: 'goal_created', from: { party: 'operator', member_id: null } }),
      liveEntry(7, 1_000, {
        kind: 'task_settled',
        status: 'completed',
        from: { party: 'member', member_id: 'ada' }
      })
    ]
    const input = choreographyInput({ cast, live, reducedMotion: true })
    const frames = play(EMPTY, input, 1_000, 1_000 + KITCHEN_BREAK_AFTER_MS + 5_000, 250)

    expect(frames.every((frame) => frame.scene.poses.size === 0)).toBe(true)
    expect(frames.every((frame) => frame.scene.meeting === null)).toBe(true)
    expect(frames.every((frame) => frame.scene.envelopes.length === 0)).toBe(true)
    expect(frames.some((frame) => frame.scene.badges.get('ada') === 'ticket')).toBe(true)
    expect(frames.some((frame) => frame.scene.badges.get('cy') === 'mail')).toBe(true)
    expect(frames.some((frame) => frame.scene.notes.length === 1)).toBe(true)
    expect(frames.some((frame) => frame.scene.boxes.length === 1)).toBe(true)
  })

  it('sits everyone down the moment motion is reduced mid-walk', () => {
    const live = [mailEntry(1, 1_000, 'ada', ['bo']), mailEntry(2, 1_000, 'cy', ['bo'], 'status')]
    const cast = [castMember('ada'), castMember('bo'), castMember('cy', 'working')]
    const moving = stepChoreography(EMPTY, choreographyInput({ cast, live }), 1_500)
    expect(floorScene(moving, 1_500).poses.has('ada')).toBe(true)
    expect(floorScene(moving, 1_500).envelopes).toHaveLength(1)

    const still = stepChoreography(
      moving,
      choreographyInput({ cast, live, reducedMotion: true }),
      1_600
    )
    expect(floorScene(still, 1_600).poses.size).toBe(0)
    expect(floorScene(still, 1_600).envelopes).toEqual([])
  })
})
