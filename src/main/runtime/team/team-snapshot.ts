import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { resolveLiveTeamMemberHandle } from './team-member-lifecycle'

/**
 * `unverifiable` rather than `exited` for a member meant to run whose terminal we cannot find:
 * after a restart or an SSH drop, absence here is not proof the agent stopped.
 */
export type TeamMemberLiveness = 'live' | 'unverifiable' | 'stopped'

export type TeamMemberView = TeamMemberRow & {
  live_handle: string | null
  liveness: TeamMemberLiveness
  agent_status: string | null
}

/** A team row safe for any reader: the webhook token is a secret only the operator may fetch. */
export function publicTeam(team: TeamRow) {
  const { webhook_token: token, ...rest } = team
  return { ...rest, webhook_enabled: token !== null }
}

export function projectTeamMember(
  runtime: RpcContext['runtime'],
  member: TeamMemberRow
): TeamMemberView {
  const handle = resolveLiveTeamMemberHandle(runtime, member)
  return {
    ...member,
    live_handle: handle,
    liveness: handle ? 'live' : member.desired_state === 'running' ? 'unverifiable' : 'stopped',
    agent_status: handle ? runtime.getAgentStatusForHandle(handle) : null
  }
}

export function buildTeamSnapshot(
  runtime: RpcContext['runtime'],
  db: OrchestrationDb,
  team: TeamRow
) {
  const members = db.listTeamMembers(team.id).map((member) => ({
    ...projectTeamMember(runtime, member),
    queue: db.listPendingTeamQueue(member.id)
  }))
  const refs = db.assignTeamTaskRefs(team.id)
  return {
    team: publicTeam(team),
    members,
    tasks: db
      .listTasksWithDispatch({ runId: team.run_id })
      .map((task) => ({ ...task, ref: refs.get(task.id) ?? null })),
    pendingQuestions: db.listPendingTeamQuestions(team.run_id),
    pendingGates: db.listGates({ status: 'pending' }).filter((gate) => gate.run_id === team.run_id),
    pendingHires: db.listTeamHireProposals(team.id, 'pending')
  }
}
