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

export async function projectTeamMember(
  runtime: RpcContext['runtime'],
  member: TeamMemberRow
): Promise<TeamMemberView> {
  const handle = resolveLiveTeamMemberHandle(runtime, member)
  return {
    ...member,
    live_handle: handle,
    liveness: handle ? 'live' : member.desired_state === 'running' ? 'unverifiable' : 'stopped',
    agent_status: handle ? await runtime.getAgentStatusForHandle(handle) : null
  }
}

/** The task the member's terminal holds an active Dispatch for, which outlives a reminted handle. */
function currentTeamTask(
  db: OrchestrationDb,
  member: TeamMemberView,
  refs: ReadonlyMap<string, string>
): { task_id: string; ref: string | null; dispatch_id: string } | null {
  const handle = member.live_handle ?? member.terminal_handle
  const dispatch = handle
    ? db.getActiveDispatchForIdentity(handle, member.pane_key ?? undefined)
    : undefined
  return dispatch
    ? {
        task_id: dispatch.task_id,
        ref: refs.get(dispatch.task_id) ?? null,
        dispatch_id: dispatch.id
      }
    : null
}

export async function buildTeamSnapshot(
  runtime: RpcContext['runtime'],
  db: OrchestrationDb,
  team: TeamRow
) {
  const refs = db.assignTeamTaskRefs(team.id)
  const meta = new Map(db.listTeamTaskMeta(team.id).map((row) => [row.task_id, row]))
  const members = await Promise.all(
    db.listTeamMembers(team.id).map(async (member) => {
      const view = await projectTeamMember(runtime, member)
      return {
        ...view,
        current_task: currentTeamTask(db, view, refs),
        queue: db.listPendingTeamQueue(member.id)
      }
    })
  )
  return {
    team: publicTeam(team),
    members,
    tasks: db.listTasksWithDispatch({ runId: team.run_id }).map((task) => ({
      ...task,
      ref: refs.get(task.id) ?? null,
      kind: meta.get(task.id)?.kind ?? 'task',
      assignee_member_id: meta.get(task.id)?.assignee_member_id ?? null
    })),
    pendingQuestions: db.listPendingTeamQuestions(team.run_id),
    pendingGates: db.listGates({ status: 'pending' }).filter((gate) => gate.run_id === team.run_id),
    pendingHires: db.listTeamHireProposals(team.id, 'pending')
  }
}
