import {
  TeamGoalCloseParams,
  TeamGoalCreateParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import {
  requireTeamOperatorOrManager,
  resolveTeamCaller
} from '../../../team/team-caller-authority'
import { closeTeamGoal, createTeamGoal } from '../../../team/team-goal-lifecycle'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

export const TEAM_GOAL_METHODS = [
  defineMethod({
    name: 'orchestration.teamGoalCreate',
    params: TeamGoalCreateParams,
    handler: async (params, context) => {
      const { runtime } = context
      const db = runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const caller = await resolveTeamCaller(context, db, team)
      requireTeamOperatorOrManager(caller, 'give the team a goal')
      return createTeamGoal({ runtime, db, team, caller, title: params.title, spec: params.spec })
    }
  }),

  defineMethod({
    name: 'orchestration.teamGoalClose',
    params: TeamGoalCloseParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const caller = await resolveTeamCaller(context, db, team)
      requireTeamOperatorOrManager(caller, 'close goals')
      return closeTeamGoal({
        db,
        team,
        caller,
        goal: params.goal,
        summary: params.summary,
        cancel: params.cancel
      })
    }
  })
]
