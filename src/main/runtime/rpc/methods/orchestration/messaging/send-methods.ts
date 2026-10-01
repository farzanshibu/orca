import { defineMethod } from '../../../core'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { isGroupAddress } from '../../../../orchestration/groups'
import { orchestrationSkillRecoveryData } from '../../../../../../shared/orchestration-rpc-contract'
import {
  SendParams,
  isDispatchMutationMessageType,
  isWorkerReportOutcome,
  parseRemoteWorkerPayload
} from '../schemas'
import { resolveMessageRun } from '../routing'
import {
  assertDispatchMailboxDeliverable,
  resolveBareOrchestrationRecipient,
  resolveRunBoundDispatchRecipient,
  type SendRecipientWarning
} from './recipient-routing'
import {
  readMutationReplayNudge,
  readWorkerDoneReplayNudge,
  stripMutationReplayNudge
} from '../../../orchestration-mutation-executor'
import { replayMutationNudge } from './mutation-replay-nudge'
import { sendRemoteMessage } from './send-remote'
import { sendPointToPointMessage } from './send-point-to-point'
import { sendGroupMessage } from './send-group'
import { sendFederatedControlMail } from './send-control-mail'
import {
  holdTeamPeerMail,
  nudgeTeamPeerAboutMail,
  resolveTeamPeerMail,
  type TeamPeerMail
} from './team-peer-mail'
import { orchestrationCallerIdentity } from '../runs/run-scope'

export const ORCHESTRATION_SEND_METHODS = [
  defineMethod({
    name: 'orchestration.send',
    params: SendParams,
    handler: async (
      params,
      {
        runtime,
        orchestrationCapability,
        legacyCoordinatorRunId,
        revalidateLegacyCoordinator,
        orchestrationCompatibilityCallerAuthority,
        recordMutationReceipt,
        markWorkerDoneMutationEffectFree,
        replayedMutationReceipt,
        orchestrationCaller,
        signal
      }
    ) => {
      const db = runtime.getOrchestrationDb()
      const legacyReplayNudge = readWorkerDoneReplayNudge(
        'orchestration.send',
        params,
        replayedMutationReceipt
      )
      const replayNudge =
        readMutationReplayNudge(replayedMutationReceipt) ??
        (legacyReplayNudge
          ? { kind: 'messages' as const, targets: [legacyReplayNudge] }
          : undefined)
      if (replayNudge) {
        replayMutationNudge(runtime, replayNudge)
        return stripMutationReplayNudge(replayedMutationReceipt)
      }
      const from = params.from ?? 'unknown'
      const attestedCaller =
        orchestrationCompatibilityCallerAuthority?.terminalHandle === from
          ? orchestrationCompatibilityCallerAuthority
          : undefined
      // Why: attested hook identity survives graph remount; caller params never supply lifecycle authority.
      const sender = orchestrationCallerIdentity(runtime, {
        handle: from,
        session: orchestrationCaller,
        paneKey: attestedCaller?.paneKey ?? runtime.getTerminalPaneKey(from)
      })
      const senderPaneKey = sender.paneKey ?? undefined
      const remoteAttachment = senderPaneKey
        ? db.findActiveRemoteAttachmentForPane(senderPaneKey)
        : undefined
      if (remoteAttachment && senderPaneKey) {
        return sendRemoteMessage({
          params,
          runtime,
          db,
          from,
          senderPaneKey,
          remoteAttachment,
          processIncarnation:
            attestedCaller?.processIncarnation ??
            runtime.getTerminalProcessIncarnation(from) ??
            undefined,
          orchestrationCapability,
          signal
        })
      }

      const runGroup =
        params.to && isGroupAddress(params.to) && !params.to.toLowerCase().startsWith('@worktree:')
      // Run groups validate their own audience; message scope cannot select a parent Dispatch.
      const routing = resolveMessageRun(runtime, {
        sender,
        to: params.to,
        runId: runGroup ? undefined : params.run,
        payload: runGroup ? undefined : params.payload
      })
      if (
        params.type === 'worker_done' &&
        !isWorkerReportOutcome(parseRemoteWorkerPayload(params.payload).outcome)
      ) {
        throw new OrchestrationError(
          'invalid_argument',
          'worker_done requires outcome=succeeded|failed for a current Dispatch.'
        )
      }
      if (params.to?.startsWith('task:')) {
        throw new OrchestrationError(
          'invalid_argument',
          'Task recipients are intentionally unsupported; use run:<id> or dispatch:<id>.'
        )
      }

      let to = params.to
      if (
        routing.run &&
        (!to ||
          ((params.type === 'worker_done' || params.type === 'heartbeat') && routing.dispatchId))
      ) {
        to = `run:${routing.run.id}`
      }
      if (!to) {
        throw new OrchestrationError(
          'run_required',
          'No recipient or active Dispatch Run could be resolved. No effects were applied.',
          orchestrationSkillRecoveryData()
        )
      }

      const sendWarnings: SendRecipientWarning[] = []
      let messageRunId = routing.run?.id
      let teamPeers: TeamPeerMail | undefined
      if (!isGroupAddress(to) && !to.startsWith('run:') && !to.startsWith('dispatch:')) {
        teamPeers = resolveTeamPeerMail(
          db,
          { handle: from, paneKey: senderPaneKey },
          { handle: to, paneKey: runtime.getLiveTerminalPaneKey(to) }
        )
        const recipient = resolveBareOrchestrationRecipient({
          runtime,
          db,
          handle: to,
          // Why the team's Run: mail between two members filed anywhere else never reaches the
          // team's feed or log, and an idle member holds no Run of its own to file it under.
          senderRunId: teamPeers?.team.run_id ?? routing.run?.id,
          explicitRunId: params.run
        })
        if (!recipient.ok) {
          throw new OrchestrationError(recipient.code, recipient.message)
        }
        to = recipient.to
        messageRunId = recipient.runId
        // A member's own-handle mail follows it across a restart, so it is not terminal-only.
        if (
          recipient.warning &&
          !(teamPeers && recipient.warning.code === 'legacy_terminal_recipient')
        ) {
          sendWarnings.push(recipient.warning)
        }
      }
      const withSendWarnings = <T extends object>(
        receipt: T
      ): T & { warnings?: SendRecipientWarning[] } =>
        sendWarnings.length > 0 ? { ...receipt, warnings: sendWarnings } : receipt

      if (!isGroupAddress(to)) {
        const addressedDispatchId = to.startsWith('dispatch:')
          ? to.slice('dispatch:'.length)
          : undefined
        const federatedTarget =
          addressedDispatchId && to === `dispatch:${addressedDispatchId}`
            ? db.getFederatedDispatch(addressedDispatchId)
            : undefined
        // Federated targets perform their own liveness check before relaying.
        if (addressedDispatchId && !federatedTarget) {
          assertDispatchMailboxDeliverable(runtime, db, addressedDispatchId)
          const runBound = resolveRunBoundDispatchRecipient(
            runtime,
            db,
            addressedDispatchId,
            params.run
          )
          if (runBound) {
            to = runBound.to
            messageRunId = runBound.runId
            sendWarnings.push(runBound.warning)
          }
        }
        const federatedControl = sendFederatedControlMail({
          params,
          runtime,
          db,
          from,
          to,
          messageRunId,
          revalidateLegacyCoordinator,
          recordMutationReceipt,
          withSendWarnings
        })
        if (federatedControl !== undefined) {
          return federatedControl
        }
        const held = isDispatchMutationMessageType(params.type)
          ? undefined
          : holdTeamPeerMail({
              runtime,
              db,
              peers: teamPeers,
              threadId: params.threadId,
              from,
              senderPaneKey,
              subject: params.subject,
              body: params.body,
              recordMutationReceipt
            })
        if (held) {
          return held
        }
        const receipt = sendPointToPointMessage({
          params,
          runtime,
          db,
          from,
          to,
          dispatchId: routing.dispatchId,
          messageRunId,
          senderPaneKey,
          legacyCoordinatorRunId,
          orchestrationCapability,
          resolveProcessIncarnation: () =>
            attestedCaller?.processIncarnation ??
            runtime.getTerminalProcessIncarnation(from) ??
            undefined,
          revalidateLegacyCoordinator,
          recordMutationReceipt,
          markWorkerDoneMutationEffectFree,
          withSendWarnings
        })
        nudgeTeamPeerAboutMail(runtime, db, teamPeers, { to, from, subject: params.subject })
        return receipt
      }
      return sendGroupMessage({
        params,
        runtime,
        db,
        from,
        groupAddress: to,
        sender,
        senderPaneKey,
        senderRunId: routing.run?.id,
        explicitRunId: params.run,
        legacyCoordinatorRunId,
        revalidateLegacyCoordinator,
        recordMutationReceipt,
        withSendWarnings
      })
    }
  })
]
