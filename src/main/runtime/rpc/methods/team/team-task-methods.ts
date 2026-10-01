import {
  TeamTaskAssignParams,
  TeamTaskCreateParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import type { TeamTaskCreateResult } from '../../../../../shared/team-goal'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { assignTeamTaskToMember } from '../../../team/team-assign-task'
import { fileTeamTask } from '../../../team/team-board-task'
import {
  requireTeamOperator,
  requireTeamOperatorOrManager,
  resolveTeamCaller
} from '../../../team/team-caller-authority'
import { acceptTeamTrigger } from '../../../team/team-trigger-intake'
import { readTeamWorkspaceFacts } from '../../../team/team-workspace-facts'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

export const TEAM_TASK_METHODS = [
  defineMethod({
    name: 'orchestration.teamTaskCreate',
    params: TeamTaskCreateParams,
    handler: async (params, context): Promise<TeamTaskCreateResult> => {
      const { runtime } = context
      const db = runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const caller = await resolveTeamCaller(context, db, team)
      if (!params.enrich) {
        requireTeamOperatorOrManager(caller, 'file tasks for the team')
        const { title, spec, goal, assignee, deps } = params
        return fileTeamTask({ runtime, db, team, caller, title, spec, goal, assignee, deps })
      }
      // The prep step: the manager turns a rough ask into a full spec and files it itself.
      requireTeamOperator(caller, 'ask the manager to write up a task')
      if (params.goal || params.assignee || params.deps?.length) {
        throw new OrchestrationError(
          'invalid_argument',
          '--enrich hands the request to the manager, who picks the goal, owner, and dependencies.'
        )
      }
      const { cli } = await readTeamWorkspaceFacts(runtime, team)
      acceptTeamTrigger(db, team, {
        source: 'enrich',
        target: 'manager',
        text: [
          `ENRICH TASK: ${params.title}`,
          params.spec ?? '',
          'Rewrite this into a task with an objective, the expected output, the tools to use, and',
          'the boundaries, then file it with an owner; Orca starts it once that member is free:',
          `  ${cli} team task add --team ${team.id} --title "<title>" --spec "<spec>" --assignee <slug>`
        ]
          .filter(Boolean)
          .join('\n')
      })
      return { enriched: true, taskId: null }
    }
  }),

  defineMethod({
    name: 'orchestration.teamTaskAssign',
    params: TeamTaskAssignParams,
    handler: async (params, context) => {
      const { runtime } = context
      const db = runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const caller = await resolveTeamCaller(context, db, team)
      requireTeamOperatorOrManager(caller, 'assign tasks')
      const taskId = db.resolveTeamTaskRef(team.id, params.task)
      const member = params.member ? db.resolveTeamMemberSelector(team.id, params.member) : null
      return assignTeamTaskToMember({ runtime, db, team, caller, taskId, member })
    }
  })
]
