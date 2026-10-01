import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'

type TeamMailRuntime = Pick<
  RpcContext['runtime'],
  'getTerminalOrchestrationCliCommand' | 'notifyMessageArrived'
>

export const TEAM_MAIL_QUEUE_SOURCE = 'mail'

/** A Run or Dispatch mailbox, which pointer delivery types into the pane by itself. */
function isPointerDeliveredMailbox(address: string): boolean {
  return address.startsWith('run:') || address.startsWith('dispatch:')
}

function queueMailNudge(
  runtime: TeamMailRuntime,
  db: OrchestrationDb,
  member: TeamMemberRow,
  handle: string,
  summary: string
): void {
  // One pending nudge covers every unread message: the first `check` reads them all.
  if (db.listPendingTeamQueue(member.id).some((item) => item.source === TEAM_MAIL_QUEUE_SOURCE)) {
    return
  }
  const cli = runtime.getTerminalOrchestrationCliCommand(handle)
  db.enqueueTeamMemberMessage(
    member.id,
    `MAIL: ${summary} Read it with \`${cli} orchestration check\`, then answer with the reply command the message shows.`,
    TEAM_MAIL_QUEUE_SOURCE
  )
}

/**
 * Tells a member between tasks that mail landed in its own-handle mailbox. Why the member queue:
 * pointer delivery only types for Run and Dispatch mailboxes, so nothing else would wake it.
 */
export function nudgeTeamMemberAboutMail(args: {
  runtime: TeamMailRuntime
  db: OrchestrationDb
  recipient: TeamMemberRow
  /** The mailbox the message was filed under. */
  to: string
  sender: TeamMemberRow | undefined
  from: string
  subject: string
}): void {
  if (isPointerDeliveredMailbox(args.to)) {
    return
  }
  const who = args.sender ? `@member:${args.sender.slug}` : args.from
  queueMailNudge(
    args.runtime,
    args.db,
    args.recipient,
    args.to,
    `${who} sent you "${args.subject}".`
  )
}

/**
 * Brings a restarted member the mail still unread under an earlier handle; `member` is its row
 * from before the restart. Without this the mail stays addressed to a terminal that is gone.
 */
export function carryTeamMemberDirectMail(args: {
  runtime: TeamMailRuntime
  db: OrchestrationDb
  team: TeamRow
  member: TeamMemberRow
  handle: string
}): number {
  const { runtime, db, team, member, handle } = args
  const moved = db.moveTeamMemberDirectMail({
    team,
    memberId: member.id,
    previousHandle: member.terminal_handle,
    handle
  })
  if (moved === 0) {
    return 0
  }
  // The manager's pane coordinates the Run, so this reroutes its mail into the Run mailbox.
  runtime.notifyMessageArrived(handle, 'status')
  if (member.is_manager !== 1) {
    queueMailNudge(
      runtime,
      db,
      member,
      handle,
      `${moved} message${moved === 1 ? '' : 's'} arrived while you were away.`
    )
  }
  return moved
}
