import { TEAM_STATUSES, type TeamStatus } from '../../../orchestration/team-types'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import {
  TeamCreateParams,
  TeamListParams,
  TeamShowParams,
  TeamUpdateParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import {
  requireNoTeamMemberCaller,
  requireTeamOperator,
  resolveTeamCaller
} from '../../../team/team-caller-authority'
import { buildTeamSnapshot, publicTeam } from '../../../team/team-snapshot'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

function parseTeamStatus(value: string): TeamStatus {
  const status = TEAM_STATUSES.find((candidate) => candidate === value)
  if (!status) {
    throw new OrchestrationError(
      'invalid_argument',
      `Team status must be one of ${TEAM_STATUSES.join(', ')}.`
    )
  }
  return status
}

export const TEAM_METHODS = [
  defineMethod({
    name: 'orchestration.teamCreate',
    params: TeamCreateParams,
    handler: async (params, context) => {
      const repo = await context.runtime.showRepo(params.repo)
      const db = context.runtime.getOrchestrationDb()
      requireNoTeamMemberCaller(context, db, 'create teams')
      return {
        team: db.createTeam({ repoId: repo.id, name: params.name, charter: params.charter })
      }
    }
  }),

  defineMethod({
    name: 'orchestration.teamList',
    params: TeamListParams,
    handler: async (params, context) => {
      const repoId = params.repo ? (await context.runtime.showRepo(params.repo)).id : undefined
      const db = context.runtime.getOrchestrationDb()
      const teams = db.listTeams({ repoId, includeArchived: params.includeArchived })
      return {
        teams: teams.map((team) => ({
          ...publicTeam(team),
          memberCount: db.listTeamMembers(team.id).length,
          pendingHires: db.listTeamHireProposals(team.id, 'pending').length
        }))
      }
    }
  }),

  defineMethod({
    name: 'orchestration.teamShow',
    params: TeamShowParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      return buildTeamSnapshot(context.runtime, db, team)
    }
  }),

  defineMethod({
    name: 'orchestration.teamUpdate',
    params: TeamUpdateParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'change the team')
      return {
        team: publicTeam(
          db.updateTeam(team.id, {
            charter: params.charter,
            status: params.status ? parseTeamStatus(params.status) : undefined
          })
        )
      }
    }
  })
]
