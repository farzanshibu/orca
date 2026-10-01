import type { TeamActivityEvent } from '../../../../shared/team-activity-event'

/** What a character has in its hands. */
export type FloorCarry = 'folder' | 'envelope' | 'box' | 'note' | 'ticket'

/**
 * What an activity event means on the floor: who is involved and what changes hands. Where anyone
 * goes is decided later, by the rules, once it is known who is busy.
 */
export type FloorIntent =
  /** A goal was set: a note for the manager lands at reception. */
  | { kind: 'goal' }
  /** Work went out to these members. Dispatches that go out together are one intent. */
  | { kind: 'dispatch'; assigneeIds: readonly string[] }
  /** Something for one or more members, from a member (`fromId`) or from outside the team. */
  | {
      kind: 'mail'
      fromId: string | null
      toIds: readonly string[]
      /** The message type, which tints an envelope; null for anything that is not a message. */
      tint: string | null
      carry: FloorCarry
    }
  /** A question, a decision or a hire that waits on the human. */
  | { kind: 'for_human' }
  /** A member finished a task. */
  | { kind: 'shipped'; ownerId: string }

// Mail that hands work over is walked across in a folder; everything else is a letter.
const FOLDER_MESSAGE_TYPES = new Set(['handoff', 'worker_done', 'merge_ready'])
// The human answers these, whoever's mailbox they were filed in.
const HUMAN_MESSAGE_TYPES = new Set(['question', 'decision_gate'])
// `dispatch_started` already tells the floor that work went out; its mail would act it out twice.
const SILENT_MESSAGE_TYPES = new Set(['dispatch', 'heartbeat'])
// Events that only put something new on the desk of the member they name.
const NOTICE_KINDS = new Set(['gate_resolved', 'hire_decided', 'goal_review'])

function mailIntent(
  event: TeamActivityEvent,
  fromId: string | null,
  tint: string | null
): FloorIntent | null {
  const toIds = [...new Set(event.to.member_ids)]
  if (toIds.length === 0) {
    return null
  }
  return {
    kind: 'mail',
    fromId,
    toIds,
    tint,
    carry: FOLDER_MESSAGE_TYPES.has(tint ?? '') ? 'folder' : 'envelope'
  }
}

/** Something new on a member's desk that nobody on the floor carried there. */
function noticeIntent(event: TeamActivityEvent): FloorIntent | null {
  return mailIntent(event, null, null)
}

function messageIntent(event: TeamActivityEvent): FloorIntent | null {
  const type = event.message_type ?? ''
  if (SILENT_MESSAGE_TYPES.has(type)) {
    return null
  }
  if (HUMAN_MESSAGE_TYPES.has(type) || event.to.party === 'operator') {
    return { kind: 'for_human' }
  }
  return mailIntent(event, event.from.member_id, event.message_type)
}

/**
 * The floor intent of one event, or null when the event changes nothing on the floor. A kind this
 * build does not know is such an event: the feed still lists it, the floor leaves it alone.
 */
export function floorIntent(event: TeamActivityEvent): FloorIntent | null {
  switch (event.kind) {
    case 'goal_created':
      return { kind: 'goal' }
    case 'dispatch_started':
      return event.to.member_ids.length > 0
        ? { kind: 'dispatch', assigneeIds: [...new Set(event.to.member_ids)] }
        : null
    case 'task_settled':
      return event.status === 'completed' && event.from.member_id
        ? { kind: 'shipped', ownerId: event.from.member_id }
        : null
    case 'gate_opened':
      return { kind: 'for_human' }
    case 'hire_proposed':
      // The human's own proposal is not something the team is waiting on them for.
      return event.from.member_id ? { kind: 'for_human' } : null
    case 'message':
      return messageIntent(event)
    case 'delivery':
      // A mailbox receipt repeats a message already acted out; a delivered note is new on a desk.
      return event.channel !== 'mailbox' && event.status === 'delivered'
        ? noticeIntent(event)
        : null
    default:
      return NOTICE_KINDS.has(event.kind) ? noticeIntent(event) : null
  }
}
