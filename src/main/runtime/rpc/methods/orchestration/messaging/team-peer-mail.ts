import type { OrchestrationDb } from '../../../../orchestration/db'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { TeamMemberRow, TeamRow } from '../../../../orchestration/team-types'
import { holdTeamMailPastReplyCap } from '../../../../team/team-mail-thread-cap'
import { nudgeTeamMemberAboutMail } from '../../../../team/team-member-direct-mail'
import { findTeamMemberForTerminal } from '../../../../team/team-member-terminal'
import { exposeMessage } from './mailbox-message-receipt'
import { recordReceiptBeforeNudge } from './mutation-replay-nudge'

/** One standing member writing to another of the same team. */
export type TeamPeerMail = { team: TeamRow; sender: TeamMemberRow; recipient: TeamMemberRow }

type TerminalIdentity = { handle: string; paneKey: string | null | undefined }

/** Sender and recipient when both are members of one team; their mail belongs to its Run. */
export function resolveTeamPeerMail(
  db: OrchestrationDb,
  from: TerminalIdentity,
  to: TerminalIdentity
): TeamPeerMail | undefined {
  const sender = findTeamMemberForTerminal(db, from.handle, from.paneKey)
  const recipient = sender ? findTeamMemberForTerminal(db, to.handle, to.paneKey) : undefined
  if (!sender || !recipient || recipient.team_id !== sender.team_id || recipient.id === sender.id) {
    return undefined
  }
  const team = db.getTeam(sender.team_id)
  return team ? { team, sender, recipient } : undefined
}

/** The receipt for a message the thread's reply cap held back, or nothing when it may go out. */
export function holdTeamPeerMail(args: {
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  peers: TeamPeerMail | undefined
  threadId: string | null | undefined
  from: string
  senderPaneKey: string | undefined
  subject: string
  body: string | undefined
  recordMutationReceipt: ((receipt: unknown) => void) | undefined
}): unknown {
  const { runtime, peers } = args
  const held = peers
    ? holdTeamMailPastReplyCap({
        db: args.db,
        team: peers.team,
        sender: peers.sender,
        recipients: [peers.recipient],
        threadId: args.threadId,
        from: args.from,
        senderPaneKey: args.senderPaneKey,
        subject: args.subject,
        body: args.body
      })
    : undefined
  if (!held) {
    return undefined
  }
  // The escalation is what was sent, so it is the receipt's message; the warning says why.
  const receipt = { message: exposeMessage(held.escalation), warnings: [held.warning] }
  return recordReceiptBeforeNudge(args.recordMutationReceipt, receipt, () =>
    runtime.notifyMessageArrived(held.escalation.to_handle, held.escalation.type)
  )
}

/** Wakes an idle member that a teammate wrote to; a busy one or the manager is reached by pointer. */
export function nudgeTeamPeerAboutMail(
  runtime: OrcaRuntimeService,
  db: OrchestrationDb,
  peers: TeamPeerMail | undefined,
  message: { to: string; from: string; subject: string }
): void {
  if (peers) {
    nudgeTeamMemberAboutMail({
      runtime,
      db,
      recipient: peers.recipient,
      sender: peers.sender,
      ...message
    })
  }
}
