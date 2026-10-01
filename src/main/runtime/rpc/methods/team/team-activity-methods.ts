import { TeamActivityParams } from '../../../../../shared/rpc-contract/orchestration-team-params'
import { readTeamActivityPage } from '../../../team/team-activity-projection'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

export const TEAM_ACTIVITY_METHODS = [
  defineMethod({
    name: 'orchestration.teamActivity',
    params: TeamActivityParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      return readTeamActivityPage(db, team, params)
    }
  })
]
