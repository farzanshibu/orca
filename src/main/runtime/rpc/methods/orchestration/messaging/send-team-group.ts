import type { OrchestrationDb } from '../../../../orchestration/db'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { resolveTeamGroupMembers } from '../../../../orchestration/groups'
import type { TeamMemberRow, TeamRow } from '../../../../orchestration/team-types'
import { holdTeamMailPastReplyCap } from '../../../../team/team-mail-thread-cap'
import { nudgeTeamMemberAboutMail } from '../../../../team/team-member-direct-mail'
import { resolveLiveTeamMemberHandle } from '../../../../team/team-member-lifecycle'
import { teamMemberLiveness } from '../../../../team/team-member-liveness'
import { legacyWorkerDeliveryContract } from '../routing'
import { exposeMessages } from './mailbox-message-receipt'
import { recordReceiptBeforeNudge } from './mutation-replay-nudge'
import { resolveBareOrchestrationRecipient, type SendRecipientWarning } from './recipient-routing'
import type { SendParams } from '../schemas'
import type { z } from 'zod'

type SendParamsInput = z.infer<typeof SendParams>

type TeamMailbox = { member: TeamMemberRow; to: string; runId: string }

function isRunOrDispatchMailbox(address: string): boolean {
  return address.startsWith('run:') || address.startsWith('dispatch:')
}

/**
 * Where a member reads mail right now: the manager its Run mailbox, a busy member its Dispatch
 * mailbox, an idle member its own handle. A member Orca cannot reach yields a warning, with a
 * mailbox as well when its mail can wait there.
 */
function resolveTeamMemberMailbox(args: {
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  team: TeamRow
  member: TeamMemberRow
  legacyAdoptedMailboxOwner: ReturnType<OrchestrationDb['getLegacyAdoptedRunMailboxOwner']>
}): { mailbox?: TeamMailbox; warning?: SendRecipientWarning } {
  const { runtime, db, team, member } = args
  const live = resolveLiveTeamMemberHandle(runtime, member)
  // Why the recorded handle too: a Dispatch mailbox outlives a terminal Orca cannot see right now.
  const handle = live ?? member.terminal_handle
  const resolved = handle
    ? resolveBareOrchestrationRecipient({
        runtime,
        db,
        handle,
        senderRunId: team.run_id,
        legacyAdoptedMailboxOwner: args.legacyAdoptedMailboxOwner
      })
    : undefined
  if (resolved?.ok) {
    // Why the recorded handle: it is the one the member's agent was started with, so it is the
    // mailbox its `check` reads even after the runtime reissued the pane's handle.
    const to = isRunOrDispatchMailbox(resolved.to)
      ? resolved.to
      : (member.terminal_handle ?? resolved.to)
    return { mailbox: { member, to, runId: resolved.runId ?? team.run_id } }
  }
  if (member.is_manager === 1) {
    // The Run mailbox is durable: a manager that is down reads it once it is back.
    return { mailbox: { member, to: `run:${team.run_id}`, runId: team.run_id } }
  }
  const liveness = teamMemberLiveness(member, live)
  if (liveness === 'live' && resolved) {
    return { warning: resolved.warning }
  }
  const unreachable = (message: string): SendRecipientWarning => ({
    code: 'recipient_unreachable',
    recipient: `@member:${member.slug}`,
    message
  })
  if (liveness === 'stopped') {
    return {
      warning: unreachable(`Team member ${member.slug} is stopped, so nothing was delivered to it.`)
    }
  }
  // Never "stopped": a terminal Orca cannot find may still be running, so its mail waits for it
  // under the handle its agent reads, and follows it if it is restarted instead.
  return member.terminal_handle
    ? {
        mailbox: { member, to: member.terminal_handle, runId: team.run_id },
        warning: unreachable(
          `Team member ${member.slug} cannot be reached right now. It may still be running; the message waits in its mailbox.`
        )
      }
    : {
        warning: unreachable(
          `Team member ${member.slug} cannot be reached right now, so nothing was delivered to it. It may still be running.`
        )
      }
}

/** `@member:<slug>` and `@role:<slug>`: the audience is the sender's team, by roster. */
export function sendTeamGroupMessage(args: {
  params: SendParamsInput
  runtime: OrcaRuntimeService
  db: OrchestrationDb
  from: string
  groupAddress: string
  team: TeamRow
  senderMember: TeamMemberRow | undefined
  senderPaneKey: string | undefined
  explicitRunId: string | undefined
  revalidateLegacyCoordinator: (() => string) | undefined
  recordMutationReceipt: ((receipt: unknown) => void) | undefined
}): unknown {
  const { params, runtime, db, from, groupAddress, team, senderMember, senderPaneKey } = args
  if (args.explicitRunId && args.explicitRunId !== team.run_id) {
    throw new OrchestrationError(
      'invalid_argument',
      `${groupAddress} addresses Run ${team.run_id}, not explicitly requested Run ${args.explicitRunId}.`
    )
  }
  const roster = db.listTeamMembers(team.id)
  const addressed = resolveTeamGroupMembers(
    groupAddress,
    roster.map((row) => ({
      slug: row.slug,
      roleSlug: row.role_slug,
      isManager: row.is_manager === 1,
      row
    }))
  ).map((member) => member.row)
  if (addressed.length === 0) {
    throw new OrchestrationError(
      'terminal_not_found',
      `No recipients resolved for group address: ${groupAddress}. Team ${team.name} has ${roster.map((row) => `@member:${row.slug}`).join(', ') || 'no members'}.`
    )
  }
  const recipients = addressed.filter((member) => member.id !== senderMember?.id)
  if (recipients.length === 0) {
    throw new OrchestrationError(
      'terminal_not_found',
      `No recipients resolved for group address: ${groupAddress} names only the sender.`
    )
  }
  args.revalidateLegacyCoordinator?.()
  const held = holdTeamMailPastReplyCap({
    db,
    team,
    sender: senderMember,
    recipients,
    threadId: params.threadId,
    from,
    senderPaneKey,
    subject: params.subject,
    body: params.body
  })
  if (held) {
    const receipt = {
      messages: exposeMessages([held.escalation]),
      recipients: 1,
      warnings: [held.warning]
    }
    return recordReceiptBeforeNudge(args.recordMutationReceipt, receipt, () =>
      runtime.notifyMessageArrived(held.escalation.to_handle, held.escalation.type)
    )
  }

  const legacyAdoptedMailboxOwner = db.getLegacyAdoptedRunMailboxOwner()
  // A sender outside the roster, such as a worker in the team's Run, may read a mailbox a member
  // also resolves to.
  const ownMailbox = senderMember
    ? undefined
    : resolveBareOrchestrationRecipient({
        runtime,
        db,
        handle: from,
        senderRunId: team.run_id,
        legacyAdoptedMailboxOwner
      })
  const warnings: SendRecipientWarning[] = []
  const mailboxes = new Map<string, TeamMailbox>()
  for (const member of recipients) {
    const resolved = resolveTeamMemberMailbox({
      runtime,
      db,
      team,
      member,
      legacyAdoptedMailboxOwner
    })
    if (resolved.warning) {
      warnings.push(resolved.warning)
    }
    if (resolved.mailbox && !(ownMailbox?.ok && ownMailbox.to === resolved.mailbox.to)) {
      mailboxes.set(resolved.mailbox.to, resolved.mailbox)
    }
  }

  const threadId = params.threadId ?? `thread_${Date.now()}`
  const delivered = [...mailboxes.values()]
  const messages = db.insertMessages(
    delivered.map((mailbox) => ({
      from,
      to: mailbox.to,
      subject: params.subject,
      body: params.body,
      type: params.type,
      priority: params.priority,
      threadId,
      payload: params.payload,
      senderPaneKey,
      runId: mailbox.runId,
      deliveryContract: legacyWorkerDeliveryContract(runtime, mailbox.runId, mailbox.to)
    }))
  )
  for (const mailbox of delivered) {
    nudgeTeamMemberAboutMail({
      runtime,
      db,
      recipient: mailbox.member,
      to: mailbox.to,
      sender: senderMember,
      from,
      subject: params.subject
    })
  }
  // Why a receipt and not an error when nobody was reachable: a stopped member is a fact about
  // the team, not a mistake in the address.
  const receipt = {
    messages: exposeMessages(messages),
    recipients: messages.length,
    ...(warnings.length > 0 ? { warnings } : {})
  }
  return recordReceiptBeforeNudge(args.recordMutationReceipt, receipt, () => {
    for (const message of messages) {
      runtime.notifyMessageArrived(message.to_handle, message.type)
    }
  })
}
