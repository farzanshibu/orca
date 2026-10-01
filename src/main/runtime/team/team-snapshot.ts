import type { TeamGoalSummary } from '../../../shared/team-goal'
import type { TeamWorkWaitReason } from '../../../shared/team-task-assignment'
import type { OrchestrationDb } from '../orchestration/db'
import type { TeamAssignedTask } from '../orchestration/db/teams/team-assigned-work-store'
import type { TeamTaskMeta } from '../orchestration/db/teams/team-task-meta-store'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { DispatchContextRow } from '../orchestration/types'
import type { RpcContext } from '../rpc/core'
import { listTeamClosingWaits } from './team-closing-time'
import { teamGoalTitle } from './team-goal-review'
import { resolveLiveTeamMemberHandle } from './team-member-lifecycle'
import { teamMemberLiveness, type TeamMemberLiveness } from './team-member-liveness'
import { readTeamMemberTurnState } from './team-member-turn-state'
import { teamWorkSchedulerFor } from './team-work-scheduler-for-runtime'

/** Closed goals kept in the snapshot, newest last; open ones are always listed. */
const CLOSED_GOALS_SHOWN = 10

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
    liveness: teamMemberLiveness(member, handle),
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

/** The assigned task each member would start next: one that can start before one still waiting. */
function nextAssignedTasks(backlog: readonly TeamAssignedTask[]): Map<string, TeamAssignedTask> {
  const next = new Map<string, TeamAssignedTask>()
  for (const row of backlog) {
    const chosen = next.get(row.assignee_member_id)
    const startable = row.status === 'ready' || row.status === 'failed'
    if (!chosen || (startable && chosen.status !== 'ready' && chosen.status !== 'failed')) {
      next.set(row.assignee_member_id, row)
    }
  }
  return next
}

/** The member a Dispatch belongs to: its task's assignee, else whoever's terminal holds it. */
function dispatchMemberId(
  db: OrchestrationDb,
  team: TeamRow,
  meta: ReadonlyMap<string, TeamTaskMeta>,
  dispatch: DispatchContextRow | undefined
): string | null {
  if (!dispatch) {
    return null
  }
  const assignee = meta.get(dispatch.task_id)?.assignee_member_id
  if (assignee) {
    return assignee
  }
  const holder =
    (dispatch.assignee_handle
      ? db.findTeamMemberByTerminal(dispatch.assignee_handle)
      : undefined) ??
    (dispatch.assignee_pane_key
      ? db.findTeamMemberByPaneKey(dispatch.assignee_pane_key)
      : undefined)
  return holder?.team_id === team.id ? holder.id : null
}

function projectTeamGoals(db: OrchestrationDb, team: TeamRow): TeamGoalSummary[] {
  const goals = db.listTeamGoals(team.id)
  const closed = goals.filter((goal) => goal.status === 'completed' || goal.status === 'failed')
  const hidden = new Set(closed.slice(0, -CLOSED_GOALS_SHOWN).map((goal) => goal.task_id))
  return goals
    .filter((goal) => !hidden.has(goal.task_id))
    .map((goal) => ({
      id: goal.task_id,
      ref: `${team.task_prefix}-${goal.number}`,
      title: teamGoalTitle(goal),
      // A goal is never worked, so its task status only says whether and how it was closed.
      status:
        goal.status === 'completed' ? 'completed' : goal.status === 'failed' ? 'cancelled' : 'open',
      progress: { done: goal.done, total: goal.total },
      review_requested_at: goal.review_requested_at
    }))
}

export async function buildTeamSnapshot(
  runtime: RpcContext['runtime'],
  db: OrchestrationDb,
  team: TeamRow
) {
  // Read first: everything below is then at least as new as this cursor.
  const activitySequence = db.getLatestTeamActivitySequence(team.id)
  const refs = db.assignTeamTaskRefs(team.id)
  const meta = new Map(db.listTeamTaskMeta(team.id).map((row) => [row.task_id, row]))
  const scheduler = teamWorkSchedulerFor(runtime)
  const nextTasks = nextAssignedTasks(db.listTeamAssignedBacklog(team.id))
  const members = await Promise.all(
    db.listTeamMembers(team.id).map(async (member) => {
      const view = await projectTeamMember(runtime, member)
      const next = nextTasks.get(member.id)
      const waitingReason: TeamWorkWaitReason | null = next
        ? await scheduler.explainWait(db, team, member, next.task_id)
        : null
      return {
        ...view,
        current_task: currentTeamTask(db, view, refs),
        waiting_reason: waitingReason,
        queue: db.listPendingTeamQueue(member.id)
      }
    })
  )
  const managerId = members.find((member) => member.is_manager === 1)?.id ?? null
  return {
    team: publicTeam(team),
    // Who the wind-down still waits on and why, so a stuck Closing Time names its cause.
    closing: team.closing_at
      ? {
          waiting_on: await listTeamClosingWaits(
            {
              resolveLiveHandle: (member) => resolveLiveTeamMemberHandle(runtime, member),
              getTurnState: (handle) => readTeamMemberTurnState(runtime, handle)
            },
            db,
            team
          )
        }
      : null,
    members,
    tasks: db.listTasksWithDispatch({ runId: team.run_id }).map((task) => ({
      ...task,
      ref: refs.get(task.id) ?? null,
      kind: meta.get(task.id)?.kind ?? 'task',
      assignee_member_id: meta.get(task.id)?.assignee_member_id ?? null
    })),
    goals: projectTeamGoals(db, team),
    pendingQuestions: db.listPendingTeamQuestions(team.run_id).map((question) => ({
      ...question,
      asker_member_id: dispatchMemberId(
        db,
        team,
        meta,
        db.getDispatchContextById(question.dispatch_id)
      )
    })),
    pendingGates: db
      .listGates({ status: 'pending' })
      .filter((gate) => gate.run_id === team.run_id)
      .map((gate) => ({
        ...gate,
        task_ref: refs.get(gate.task_id) ?? null,
        // A gate with no worker behind it was raised by the manager.
        member_id:
          meta.get(gate.task_id)?.assignee_member_id ??
          dispatchMemberId(db, team, meta, db.getDispatchContext(gate.task_id)) ??
          managerId
      })),
    pendingHires: db.listTeamHireProposals(team.id, 'pending'),
    activity_sequence: activitySequence
  }
}
