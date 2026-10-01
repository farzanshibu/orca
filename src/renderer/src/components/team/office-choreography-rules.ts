import {
  MAX_ENVELOPES_IN_FLIGHT,
  effectId,
  isOnTheFloor,
  walksTheFloor,
  type FloorBadgeKind,
  type FloorCastMember,
  type FloorEffectDraft,
  type FloorJob,
  type FloorMeetingKind,
  type FloorPlace
} from './office-choreography-state'
import type { FloorCarry, FloorIntent } from './office-floor-events'
import { conferenceAnchorId, kitchenAnchorId } from './office-floor-plan'

const ENVELOPE_FLIGHT_MS = 900
const BADGE_MS = 6_000
const NOTE_MS = 6_000
// A goal's note waits on the tray for the manager, who may have errands to finish first.
const GOAL_NOTE_WAIT_MS = 20_000
const BOX_MS = 5_000
const HANDOVER_STAY_MS = 600
const PICKUP_STAY_MS = 500
const KICKOFF_TALK_MS = 3_000
const GATHERING_TALK_MS = 2_500
// Whoever reaches a meeting after it broke up still sits down for a moment.
const LATE_ARRIVAL_STAY_MS = 600
const GOAL_NOTE_KEY = 'note'

export type FloorRuleContext = {
  /** The beat's id: its errands and keyed effects are named after it. */
  beatId: string
  cast: ReadonlyMap<string, FloorCastMember>
  /** No walking, no gathering, no flying envelopes: only what appears in place. */
  reducedMotion: boolean
  /** Conference chairs nobody is in or headed for, lowest first. */
  freeConferenceSeats: readonly number[]
  envelopesInFlight: number
  /** How long this member's walk to `to` takes from where it is now. */
  walkMs: (memberId: string, to: FloorPlace) => number
}

type FloorErrand = { memberId: string; job: FloorJob }

/** What one intent puts on the floor. */
export type FloorBeat = {
  errands: readonly FloorErrand[]
  /** Timed from the beat's start. */
  effects: readonly FloorEffectDraft[]
  /** Set when the errands are one meeting, which lasts this long from the beat's start. */
  meeting: { kind: FloorMeetingKind; lastsMs: number } | null
}

const NOTHING: FloorBeat = { errands: [], effects: [], meeting: null }

function badge(memberId: string, kind: FloorBadgeKind, afterMs = 0): FloorEffectDraft {
  return { show: { kind: 'badge', memberId, badge: kind }, afterMs, lastsMs: BADGE_MS }
}

function errand(
  ctx: FloorRuleContext,
  memberId: string,
  to: FloorPlace,
  rest: Partial<FloorJob> = {}
): FloorErrand {
  return {
    memberId,
    job: {
      id: `${ctx.beatId}:${memberId}`,
      to,
      carrying: null,
      holding: null,
      stayMs: PICKUP_STAY_MS,
      meetingId: null,
      arrive: [],
      takes: null,
      rest: false,
      ...rest
    }
  }
}

function isBusy(member: FloorCastMember): boolean {
  return member.activity === 'working'
}

/** Able to leave its desk right now: on the floor, verifiable, and not in the middle of work. */
function isFree(member: FloorCastMember | undefined): member is FloorCastMember {
  return walksTheFloor(member) && !isBusy(member)
}

function managerOf(ctx: FloorRuleContext): FloorCastMember | undefined {
  return [...ctx.cast.values()].find((member) => member.manager)
}

function onTheFloor(ctx: FloorRuleContext, ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => isOnTheFloor(ctx.cast.get(id)))
}

/** A working recipient keeps working and gets a badge instead of being pulled away. */
function badgeRecipients(
  recipientIds: readonly string[],
  kind: FloorBadgeKind = 'mail'
): FloorBeat {
  return { ...NOTHING, effects: recipientIds.map((id) => badge(id, kind)) }
}

/** Questions, gates and hires for the human: a note appears at reception. */
function noteForHuman(): FloorBeat {
  return { ...NOTHING, effects: [{ show: { kind: 'note' }, afterMs: 0, lastsMs: NOTE_MS }] }
}

/** A new goal: a note lands at reception and the manager walks over to fetch it, then returns. */
function fetchGoalNote(ctx: FloorRuleContext): FloorBeat {
  const manager = managerOf(ctx)
  if (ctx.reducedMotion || !isFree(manager)) {
    const told = isOnTheFloor(manager) ? [badge(manager.id, 'mail')] : []
    return { ...NOTHING, effects: [...noteForHuman().effects, ...told] }
  }
  return {
    ...NOTHING,
    errands: [
      errand(
        ctx,
        manager.id,
        { kind: 'spot', anchor: 'reception' },
        { holding: 'note', takes: effectId(ctx.beatId, GOAL_NOTE_KEY) }
      )
    ],
    effects: [
      { show: { kind: 'note' }, afterMs: 0, lastsMs: GOAL_NOTE_WAIT_MS, key: GOAL_NOTE_KEY }
    ]
  }
}

type MeetingPlace = { memberId: string; to: FloorPlace; holding: FloorCarry | null }

const WHITEBOARD: FloorPlace = { kind: 'spot', anchor: 'whiteboard' }

/** One meeting: everyone walks to their place, and nobody leaves before the talking is done. */
function meeting(
  ctx: FloorRuleContext,
  kind: FloorMeetingKind,
  places: readonly MeetingPlace[],
  talkMs: number
): Pick<FloorBeat, 'errands' | 'meeting'> {
  const travelMs = Math.max(0, ...places.map(({ memberId, to }) => ctx.walkMs(memberId, to)))
  return {
    errands: places.map(({ memberId, to, holding }) =>
      errand(ctx, memberId, to, { holding, stayMs: LATE_ARRIVAL_STAY_MS, meetingId: ctx.beatId })
    ),
    meeting: { kind, lastsMs: travelMs + talkMs }
  }
}

function conferenceChair(seat: number): FloorPlace {
  return { kind: 'spot', anchor: conferenceAnchorId(seat) }
}

/**
 * Two or more dispatches going out together: one kickoff meeting. The manager stands at the
 * whiteboard, the assignees sit at the table, then everyone walks back to their desks. Working or
 * not, whoever was just handed work attends: the meeting is how that work reaches them.
 */
function kickoffMeeting(ctx: FloorRuleContext, assigneeIds: readonly string[]): FloorBeat {
  const chairs = ctx.freeConferenceSeats
  const manager = managerOf(ctx)
  const places: MeetingPlace[] = assigneeIds.slice(0, chairs.length).map((memberId, index) => ({
    memberId,
    to: conferenceChair(chairs[index]),
    holding: 'ticket'
  }))
  if (walksTheFloor(manager) && !assigneeIds.includes(manager.id)) {
    places.unshift({ memberId: manager.id, to: WHITEBOARD, holding: null })
  }
  return {
    ...meeting(ctx, 'kickoff', places, KICKOFF_TALK_MS),
    // More assignees than chairs: the rest get their ticket at their desks.
    effects: assigneeIds.slice(chairs.length).map((id) => badge(id, 'ticket'))
  }
}

/** A single dispatch: an idle assignee grabs its ticket at the whiteboard, then sits down. */
function grabTicket(ctx: FloorRuleContext, assigneeId: string): FloorBeat {
  if (!isFree(ctx.cast.get(assigneeId))) {
    return badgeRecipients([assigneeId], 'ticket')
  }
  return { ...NOTHING, errands: [errand(ctx, assigneeId, WHITEBOARD, { holding: 'ticket' })] }
}

function dispatchWork(ctx: FloorRuleContext, assigneeIds: readonly string[]): FloorBeat {
  const assignees = onTheFloor(ctx, assigneeIds)
  const walking = assignees.filter((id) => walksTheFloor(ctx.cast.get(id)))
  const seated = assignees.filter((id) => !walking.includes(id))
  if (ctx.reducedMotion || walking.length === 0) {
    return badgeRecipients(assignees, 'ticket')
  }
  const beat = walking.length >= 2 ? kickoffMeeting(ctx, walking) : grabTicket(ctx, walking[0])
  return { ...beat, effects: [...beat.effects, ...seated.map((id) => badge(id, 'ticket'))] }
}

/** Handoffs and `worker_done`: the sender walks to the recipient's desk with a folder. */
function walkMailOver(
  ctx: FloorRuleContext,
  senderId: string,
  recipientId: string,
  carry: FloorCarry
): FloorBeat {
  return {
    ...NOTHING,
    errands: [
      errand(
        ctx,
        senderId,
        { kind: 'beside', memberId: recipientId },
        { carrying: carry, stayMs: HANDOVER_STAY_MS, arrive: [badge(recipientId, 'mail')] }
      )
    ]
  }
}

/**
 * A working sender does not leave its desk: an envelope flies desk to desk instead. Only so many
 * are in the air at once; past that the mail simply shows up on the recipient's desk.
 */
function flyEnvelopes(
  ctx: FloorRuleContext,
  senderId: string,
  recipientIds: readonly string[],
  tint: string | null
): FloorBeat {
  const room = Math.max(0, MAX_ENVELOPES_IN_FLIGHT - ctx.envelopesInFlight)
  return {
    ...NOTHING,
    effects: recipientIds.flatMap((toId, index) =>
      index < room
        ? [
            {
              show: { kind: 'envelope' as const, fromId: senderId, toId, tint },
              afterMs: 0,
              lastsMs: ENVELOPE_FLIGHT_MS
            },
            badge(toId, 'mail', ENVELOPE_FLIGHT_MS)
          ]
        : [badge(toId, 'mail')]
    )
  }
}

/**
 * Group messages and standups: the people involved gather in the conference room. Whoever is
 * working stays at their desk with a badge, and a meeting of one is not a meeting.
 */
function gatherInConference(
  ctx: FloorRuleContext,
  senderId: string | null,
  recipientIds: readonly string[]
): FloorBeat {
  const chairs = ctx.freeConferenceSeats
  const free = [...(senderId ? [senderId] : []), ...recipientIds].filter((id) =>
    isFree(ctx.cast.get(id))
  )
  const attending = free.slice(0, chairs.length)
  if (attending.length < 2) {
    return badgeRecipients(recipientIds)
  }
  return {
    ...meeting(
      ctx,
      'gathering',
      attending.map((memberId, index) => ({
        memberId,
        to: conferenceChair(chairs[index]),
        holding: null
      })),
      GATHERING_TALK_MS
    ),
    effects: recipientIds.filter((id) => !attending.includes(id)).map((id) => badge(id, 'mail'))
  }
}

function deliverMail(
  ctx: FloorRuleContext,
  intent: Extract<FloorIntent, { kind: 'mail' }>
): FloorBeat {
  const recipients = onTheFloor(ctx, intent.toIds).filter((id) => id !== intent.fromId)
  const sender = intent.fromId ? ctx.cast.get(intent.fromId) : undefined
  // Mail from outside the team, or from a member who cannot be shown moving, just arrives.
  if (ctx.reducedMotion || recipients.length === 0 || (sender && !walksTheFloor(sender))) {
    return badgeRecipients(recipients)
  }
  if (sender && isBusy(sender)) {
    return flyEnvelopes(ctx, sender.id, recipients, intent.tint)
  }
  if (intent.toIds.length >= 2) {
    return gatherInConference(ctx, sender?.id ?? null, recipients)
  }
  return sender
    ? walkMailOver(ctx, sender.id, recipients[0], intent.carry)
    : badgeRecipients(recipients)
}

/** A finished subtask: its owner carries a box to the warehouse dock. */
function carryBoxToDock(ctx: FloorRuleContext, ownerId: string): FloorBeat {
  const box: FloorEffectDraft = { show: { kind: 'box' }, afterMs: 0, lastsMs: BOX_MS }
  if (ctx.reducedMotion || !isFree(ctx.cast.get(ownerId))) {
    return { ...NOTHING, effects: [box] }
  }
  return {
    ...NOTHING,
    errands: [
      errand(ctx, ownerId, { kind: 'spot', anchor: 'dock' }, { carrying: 'box', arrive: [box] })
    ]
  }
}

/** An idle member walks to the kitchen; the break lasts until work arrives. */
export function kitchenBreak(memberId: string, spot: number): FloorJob {
  return {
    id: `break:${memberId}`,
    to: { kind: 'spot', anchor: kitchenAnchorId(spot) },
    carrying: null,
    holding: null,
    stayMs: Number.POSITIVE_INFINITY,
    meetingId: null,
    arrive: [],
    takes: null,
    rest: true
  }
}

/** What an intent puts on the floor, given who is busy right now. */
export function planBeat(intent: FloorIntent, ctx: FloorRuleContext): FloorBeat {
  switch (intent.kind) {
    case 'goal':
      return fetchGoalNote(ctx)
    case 'dispatch':
      return dispatchWork(ctx, intent.assigneeIds)
    case 'mail':
      return deliverMail(ctx, intent)
    case 'for_human':
      return noteForHuman()
    case 'shipped':
      return carryBoxToDock(ctx, intent.ownerId)
  }
}
