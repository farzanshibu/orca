import { agentHookServer } from '../agent-hooks/server'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { resolveLiveTeamMemberHandle, stopTeamMember } from '../runtime/team/team-member-lifecycle'
import { TeamClosingTime } from '../runtime/team/team-closing-time'
import { TeamMissionScheduler } from '../runtime/team/team-mission-scheduler'
import { TeamQueueDispatcher } from '../runtime/team/team-queue-dispatcher'
import { TeamSpendMonitor } from '../runtime/team/team-spend-monitor'
import { TeamToolLoopBreaker } from '../runtime/team/team-tool-loop-breaker'
import { TeamWebhookServer } from '../runtime/team/team-webhook-server'
import { mainProcessState as state } from './main-process-state'

/** Background loops for standing teams: spend and breaker, and idle delivery of queued messages. */
export function startTeamBackgroundLoops(runtime: OrcaRuntimeService): void {
  const monitor = new TeamSpendMonitor({
    getDb: () => runtime.getOrchestrationDb(),
    getProviderSessionIds: (paneKey) =>
      agentHookServer
        .getStatusSnapshotForPane(paneKey)
        .flatMap((row) => (row.providerSession?.id ? [row.providerSession.id] : [])),
    getUsageReader: (agent) =>
      agent === 'claude' ? state.claudeUsage : agent === 'codex' ? state.codexUsage : null,
    interruptMember: async (member) => {
      const handle = resolveLiveTeamMemberHandle(runtime, member)
      if (handle) {
        await runtime.sendTerminal(handle, { interrupt: true }, { inputKind: 'driving' })
      }
    },
    notifyMailbox: (mailbox) => runtime.notifyMessageArrived(mailbox, 'escalation')
  })
  monitor.start()
  new TeamQueueDispatcher({
    getDb: () => runtime.getOrchestrationDb(),
    resolveLiveHandle: (member) => resolveLiveTeamMemberHandle(runtime, member),
    getAgentStatus: (handle) => runtime.getAgentStatusForHandle(handle),
    sendPrompt: async (handle, text) => {
      await runtime.sendTerminalAgentPrompt(handle, text, { inputKind: 'driving' })
    }
  }).start()
  new TeamMissionScheduler(() => runtime.getOrchestrationDb()).start()
  new TeamWebhookServer(() => runtime.getOrchestrationDb()).start()
  const loopBreaker = new TeamToolLoopBreaker(() => runtime.getOrchestrationDb(), {
    interruptMember: async (member) => {
      const handle = resolveLiveTeamMemberHandle(runtime, member)
      if (handle) {
        await runtime.sendTerminal(handle, { interrupt: true }, { inputKind: 'driving' })
      }
    },
    notifyMailbox: (mailbox) => runtime.notifyMessageArrived(mailbox, 'escalation'),
    steerMember: async (member, text) => {
      const handle = resolveLiveTeamMemberHandle(runtime, member)
      if (handle) {
        await runtime.sendTerminalAgentPrompt(handle, text, { inputKind: 'driving' })
      }
    }
  })
  agentHookServer.subscribeEnrichedStatus((payload) => {
    void loopBreaker.observe(payload).catch((error) => console.warn('[team-loop-breaker]', error))
  })
  new TeamClosingTime({
    getDb: () => runtime.getOrchestrationDb(),
    resolveLiveHandle: (member) => resolveLiveTeamMemberHandle(runtime, member),
    getAgentStatus: (handle) => runtime.getAgentStatusForHandle(handle),
    stopMember: async (member) => {
      await stopTeamMember({ runtime, db: runtime.getOrchestrationDb(), member })
    }
  }).start()
}
