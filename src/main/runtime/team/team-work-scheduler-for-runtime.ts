import type { RpcContext } from '../rpc/core'
import { resolveLiveTeamMemberHandle } from './team-member-lifecycle'
import { TeamMemberTurnLedger } from './team-member-turn-ledger'
import { readTeamMemberTurnState } from './team-member-turn-state'
import { queuedTeamTurnKind } from './team-queue-dispatcher'
import { startTeamTaskDispatch, teamTaskDispatchWait } from './team-task-dispatch'
import { TeamWorkScheduler } from './team-work-scheduler'
import { readTeamWorkspaceFacts } from './team-workspace-facts'

type TeamRuntime = RpcContext['runtime']

const schedulers = new WeakMap<TeamRuntime, TeamWorkScheduler>()

/**
 * The runtime's one team scheduler, made on first use. RPC methods and the background loops must
 * reach the same instance: its turn ledger and in-flight starts are what make a member's turn and
 * its one active dispatch exclusive.
 */
export function teamWorkSchedulerFor(runtime: TeamRuntime): TeamWorkScheduler {
  const existing = schedulers.get(runtime)
  if (existing) {
    return existing
  }
  const getDb = () => runtime.getOrchestrationDb()
  const scheduler = new TeamWorkScheduler({
    getDb,
    turns: new TeamMemberTurnLedger({
      queuedKind: (memberId) => queuedTeamTurnKind(getDb(), memberId)
    }),
    resolveLiveHandle: (member) => resolveLiveTeamMemberHandle(runtime, member),
    getTurnState: (handle) => readTeamMemberTurnState(runtime, handle),
    dispatchWait: (db, team, task, member) =>
      teamTaskDispatchWait({ runtime, db, team, task, member }),
    startDispatch: (db, team, taskId, member) =>
      startTeamTaskDispatch({ runtime, db, team, taskId, member }),
    notifyMailbox: (mailbox) => runtime.notifyMessageArrived(mailbox, 'escalation'),
    workspaceFacts: (team) => readTeamWorkspaceFacts(runtime, team)
  })
  schedulers.set(runtime, scheduler)
  return scheduler
}
