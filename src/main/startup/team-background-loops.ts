import { agentHookServer } from '../agent-hooks/server'
import { TEAM_ACTIVITY_RETENTION } from '../runtime/orchestration/db/teams/team-activity-store'
import type { TeamMemberRow } from '../runtime/orchestration/team-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { resolveLiveTeamMemberHandle, stopTeamMember } from '../runtime/team/team-member-lifecycle'
import { TeamClosingTime } from '../runtime/team/team-closing-time'
import { watchTeamMemberStatusEdges } from '../runtime/team/team-member-status-edges'
import { TeamMemberTurnLedger } from '../runtime/team/team-member-turn-ledger'
import { readTeamMemberTurnState } from '../runtime/team/team-member-turn-state'
import { TeamMissionScheduler } from '../runtime/team/team-mission-scheduler'
import { TeamQueueDispatcher, queuedTeamTurnKind } from '../runtime/team/team-queue-dispatcher'
import { TeamSpendMonitor } from '../runtime/team/team-spend-monitor'
import { TeamToolLoopBreaker } from '../runtime/team/team-tool-loop-breaker'
import { TeamWebhookServer } from '../runtime/team/team-webhook-server'
import { mainProcessState as state } from './main-process-state'

const ACTIVITY_PRUNE_INTERVAL_MS = 60 * 60_000

/**
 * Background loops for standing teams: spend and breakers, idle delivery of queued messages, and
 * the wind-down. Returns the disposer that stops every one of them; quit calls it.
 */
export function startTeamBackgroundLoops(runtime: OrcaRuntimeService): () => void {
  const getDb = () => runtime.getOrchestrationDb()
  const resolveLiveHandle = (member: TeamMemberRow) => resolveLiveTeamMemberHandle(runtime, member)
  const getTurnState = (handle: string) => readTeamMemberTurnState(runtime, handle)
  const interruptMember = async (member: TeamMemberRow) => {
    const handle = resolveLiveHandle(member)
    if (handle) {
      await runtime.sendTerminal(handle, { interrupt: true }, { inputKind: 'driving' })
    }
  }
  const notifyMailbox = (mailbox: string) => runtime.notifyMessageArrived(mailbox, 'escalation')

  const monitor = new TeamSpendMonitor({
    getDb,
    getProviderSessionIds: (paneKey) =>
      agentHookServer
        .getStatusSnapshotForPane(paneKey)
        .flatMap((row) => (row.providerSession?.id ? [row.providerSession.id] : [])),
    getUsageReader: (agent) =>
      agent === 'claude' ? state.claudeUsage : agent === 'codex' ? state.codexUsage : null,
    interruptMember,
    notifyMailbox
  })
  monitor.start()

  // One ledger for every loop that types into a member, so two never spend the same idle edge.
  const turns = new TeamMemberTurnLedger({
    queuedKind: (memberId) => queuedTeamTurnKind(getDb(), memberId)
  })
  const queue = new TeamQueueDispatcher({
    getDb,
    turns,
    resolveLiveHandle,
    getTurnState,
    sendPrompt: async (handle, text) => {
      await runtime.sendTerminalAgentPrompt(handle, text, { inputKind: 'driving' })
    }
  })
  queue.start()
  const stopStatusEdges = watchTeamMemberStatusEdges({
    getDb,
    subscribe: (listener) => agentHookServer.subscribeStatusChanges(listener),
    onEdge: (member, turnState) => {
      if (turnState === 'working') {
        turns.noteWorking(member.id)
      }
      queue.wake()
    }
  })

  const missions = new TeamMissionScheduler(getDb)
  missions.start()
  const pruneActivity = setInterval(() => {
    try {
      getDb().pruneTeamActivity(TEAM_ACTIVITY_RETENTION)
    } catch (error) {
      console.warn('[team-activity] prune failed', error)
    }
  }, ACTIVITY_PRUNE_INTERVAL_MS)
  pruneActivity.unref?.()
  const webhooks = new TeamWebhookServer(getDb)
  webhooks.start()

  const loopBreaker = new TeamToolLoopBreaker(getDb, {
    interruptMember,
    notifyMailbox,
    steerMember: async (member, text) => {
      const handle = resolveLiveHandle(member)
      if (handle) {
        await runtime.sendTerminalAgentPrompt(handle, text, { inputKind: 'driving' })
      }
    }
  })
  const stopLoopBreaker = agentHookServer.subscribeEnrichedStatus((payload) => {
    void loopBreaker.observe(payload).catch((error) => console.warn('[team-loop-breaker]', error))
  })

  const closing = new TeamClosingTime({
    getDb,
    resolveLiveHandle,
    getTurnState,
    stopMember: async (member) => {
      await stopTeamMember({ runtime, db: getDb(), member })
    }
  })
  closing.start()

  let disposed = false
  return () => {
    if (disposed) {
      return
    }
    disposed = true
    stopStatusEdges()
    stopLoopBreaker()
    monitor.stop()
    queue.stop()
    missions.stop()
    clearInterval(pruneActivity)
    webhooks.stop()
    closing.stop()
  }
}
