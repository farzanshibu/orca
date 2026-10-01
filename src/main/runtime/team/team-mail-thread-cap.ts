import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { MessageRow } from '../orchestration/types'
import type { SendRecipientWarning } from '../rpc/methods/orchestration/messaging/recipient-routing'

/** Replies two members may trade in one thread before Orca hands it to the manager. */
export const TEAM_PEER_THREAD_REPLY_CAP = 6

// Marks the one escalation a thread gets, so a later send can tell it was already handed over.
const THREAD_ESCALATION_PAYLOAD = JSON.stringify({ kind: 'team_thread_reply_cap' })

/** A reply is a message from a different member than the one before it; a group send is one. */
function wouldPassReplyCap(senders: readonly string[], senderId: string): boolean {
  let replies = 0
  for (let index = 1; index < senders.length; index += 1) {
    if (senders[index] !== senders[index - 1]) {
      replies += 1
    }
  }
  const last = senders.at(-1)
  return replies + (last !== undefined && last !== senderId ? 1 : 0) > TEAM_PEER_THREAD_REPLY_CAP
}

export type HeldTeamMail = { escalation: MessageRow; warning: SendRecipientWarning }

/**
 * Holds a message that would take a member-to-member thread past the reply cap and gives it to the
 * manager instead, once per thread. Why: two agents answering each other never stop on their own.
 * Returns nothing while the thread is under the cap; throws once it was already handed over.
 */
export function holdTeamMailPastReplyCap(args: {
  db: OrchestrationDb
  team: TeamRow
  sender: TeamMemberRow | undefined
  recipients: readonly TeamMemberRow[]
  threadId: string | null | undefined
  from: string
  senderPaneKey: string | undefined
  subject: string
  body: string | undefined
}): HeldTeamMail | undefined {
  const { db, team, sender, threadId } = args
  // The manager is who a thread escalates to, so its own threads are never capped.
  const peers = args.recipients.filter((member) => member.is_manager !== 1)
  if (!threadId || !sender || sender.is_manager === 1 || peers.length === 0) {
    return undefined
  }
  const names = peers.map((member) => `@member:${member.slug}`).join(', ')
  // Checked first: a handed-over thread stays closed to both members, not only the one held back.
  if (db.hasTeamThreadEscalation(team.run_id, threadId, THREAD_ESCALATION_PAYLOAD)) {
    throw new OrchestrationError(
      'team_thread_escalated',
      `This thread with ${names} was handed to the manager after ${TEAM_PEER_THREAD_REPLY_CAP} replies, so nothing was sent. Wait for the manager; start a new thread only for a new topic.`,
      { effectsApplied: false, threadId }
    )
  }
  if (!wouldPassReplyCap(db.listTeamPeerThreadSenders(team, threadId), sender.id)) {
    return undefined
  }
  const escalation = db.insertMessage({
    from: args.from,
    to: `run:${team.run_id}`,
    subject: `Escalated: ${args.subject}`,
    body: [
      `Orca held this message back: @member:${sender.slug} and ${names} passed ${TEAM_PEER_THREAD_REPLY_CAP} replies in one thread. Decide what they need and tell them.`,
      ...(args.body ? ['', args.body] : [])
    ].join('\n'),
    type: 'escalation',
    priority: 'high',
    threadId,
    payload: THREAD_ESCALATION_PAYLOAD,
    senderPaneKey: args.senderPaneKey,
    runId: team.run_id
  })
  return {
    escalation,
    warning: {
      code: 'thread_escalated',
      recipient: names,
      message: `This thread with ${names} passed ${TEAM_PEER_THREAD_REPLY_CAP} replies, so Orca gave your message to the manager instead of delivering it. Wait for the manager; start a new thread only for a new topic.`
    }
  }
}
