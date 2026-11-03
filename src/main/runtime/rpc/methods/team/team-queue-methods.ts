import {
  TeamQueueAddParams,
  TeamQueueRemoveParams,
  TeamQueueReorderParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { requireTeamOperator, resolveTeamCaller } from '../../../team/team-caller-authority'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

export const TEAM_QUEUE_METHODS = [
  defineMethod({
    name: 'orchestration.teamQueueAdd',
    params: TeamQueueAddParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'queue messages')
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      return { item: db.enqueueTeamMemberMessage(member.id, params.text) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamQueueReorder',
    params: TeamQueueReorderParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'reorder queued messages')
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      return { queue: db.reorderTeamQueue(member.id, params.order) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamQueueRemove',
    params: TeamQueueRemoveParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'remove queued messages')
      const item = db.requireTeamQueueItem(params.id)
      if (db.requireTeamMember(item.member_id).team_id !== team.id) {
        throw new OrchestrationError(
          'invalid_argument',
          `Queued message ${params.id} is not in ${team.name}.`
        )
      }
      db.removeTeamQueueItem(item.id)
      return { removed: item.id }
    }
  })
]
