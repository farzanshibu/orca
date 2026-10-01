import {
  TeamTaskAssignParams,
  TeamTaskCreateParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import { teamActivitySubject } from '../../../orchestration/db/teams/team-activity-store'
import {
  requireTeamOperator,
  requireTeamOperatorOrManager,
  resolveTeamCaller,
  teamCallerParticipant
} from '../../../team/team-caller-authority'
import { startTeamTaskDispatch } from '../../../team/team-task-dispatch'
import { acceptTeamTrigger } from '../../../team/team-trigger-intake'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

export const TEAM_TASK_METHODS = [
  defineMethod({
    name: 'orchestration.teamTaskCreate',
    params: TeamTaskCreateParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'file tasks for the team')
      if (params.enrich) {
        // The prep step: the manager turns a rough ask into a full spec and files it itself.
        acceptTeamTrigger(db, team, {
          source: 'enrich',
          target: 'manager',
          text: [
            `ENRICH TASK: ${params.title}`,
            params.spec ?? '',
            'Rewrite this into a task with an objective, the expected output, the tools to use, and',
            'the boundaries, then file it with `orchestration task-create` and dispatch it.'
          ]
            .filter(Boolean)
            .join('\n')
        })
        return { enriched: true, taskId: null }
      }
      const task = db.createTask({
        runId: team.run_id,
        taskTitle: params.title,
        spec: params.spec ?? params.title
      })
      return {
        enriched: false,
        taskId: task.id,
        ref: db.assignTeamTaskRefs(team.id).get(task.id) ?? null
      }
    }
  }),

  defineMethod({
    name: 'orchestration.teamTaskAssign',
    params: TeamTaskAssignParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const caller = resolveTeamCaller(context, db, team)
      requireTeamOperatorOrManager(caller, 'assign tasks')
      const taskId = db.resolveTeamTaskRef(team.id, params.task)
      const member = params.member ? db.resolveTeamMemberSelector(team.id, params.member) : null
      const meta = db.assignTeamTask(team.id, taskId, member?.id ?? null)
      const ref = `${team.task_prefix}-${meta.number}`
      const task = db.getTask(taskId)
      db.recordTeamActivity({
        teamId: team.id,
        kind: 'task_assigned',
        status: member ? 'assigned' : 'unassigned',
        taskId,
        from: teamCallerParticipant(caller),
        to: member ? { party: 'member', memberId: member.id } : { party: 'team' },
        subject: task?.task_title ?? teamActivitySubject(task?.spec ?? ref)
      })
      if (!member) {
        return { taskId, ref, member: null, started: false }
      }
      // Assigning starts the task now when it can; otherwise Orca starts it once the reason clears.
      const result = await startTeamTaskDispatch({
        runtime: context.runtime,
        db,
        team,
        taskId,
        member
      })
      return {
        taskId,
        ref,
        member: member.slug,
        started: result.outcome === 'started',
        ...(result.outcome === 'waiting' ? { waiting: result.waiting } : {}),
        ...(result.outcome === 'failed' ? { error: result.error } : {}),
        ...(result.outcome === 'waiting' ? {} : { dispatchId: result.dispatchId })
      }
    }
  })
]
