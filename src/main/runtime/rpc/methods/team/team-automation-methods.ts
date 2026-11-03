import {
  TeamMissionAddParams,
  TeamMissionEnableParams,
  TeamMissionParams,
  TeamShowParams,
  TeamClosingTimeParams,
  TeamTriggersSetParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import { TEAM_TRIGGER_MODES } from '../../../../../shared/team-mission-schedule'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import type { TeamRow } from '../../../orchestration/team-types'
import { requireTeamOperator, resolveTeamCaller } from '../../../team/team-caller-authority'
import { TEAM_WEBHOOK_DEFAULT_PORT, teamWebhookPath } from '../../../team/team-webhook-server'
import { beginTeamClosingTime } from '../../../team/team-closing-time'
import { resolveLiveTeamMemberHandle } from '../../../team/team-member-lifecycle'
import { defineMethod } from '../../core'
import type { OrchestrationDb } from '../../../orchestration/db'
import { resolveTeamFromParams } from './team-selector'

function requireMissionInTeam(db: OrchestrationDb, team: TeamRow, id: string) {
  const mission = db.requireTeamMission(id)
  if (mission.team_id !== team.id) {
    throw new OrchestrationError('invalid_argument', `Mission ${id} is not in ${team.name}.`)
  }
  return mission
}

function triggerSettings(team: TeamRow) {
  return {
    triggerMode: team.trigger_mode,
    autoCompactTokens: team.auto_compact_tokens,
    webhookToken: team.webhook_token,
    webhookUrl: team.webhook_token
      ? `http://127.0.0.1:${TEAM_WEBHOOK_DEFAULT_PORT}${teamWebhookPath(team.id)}`
      : null
  }
}

export const TEAM_AUTOMATION_METHODS = [
  defineMethod({
    name: 'orchestration.teamMissionList',
    params: TeamShowParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      return { missions: db.listTeamMissions(team.id) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMissionAdd',
    params: TeamMissionAddParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'schedule missions')
      return {
        mission: db.addTeamMission(team.id, {
          name: params.name,
          target: params.target ?? 'manager',
          prompt: params.prompt,
          schedule: params.schedule
        })
      }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMissionSetEnabled',
    params: TeamMissionEnableParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'change missions')
      requireMissionInTeam(db, team, params.id)
      return { mission: db.setTeamMissionEnabled(params.id, params.enabled) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMissionRemove',
    params: TeamMissionParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'remove missions')
      requireMissionInTeam(db, team, params.id)
      db.removeTeamMission(params.id)
      return { removed: params.id }
    }
  }),

  defineMethod({
    name: 'orchestration.teamTriggers',
    params: TeamShowParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'read trigger secrets')
      return triggerSettings(team)
    }
  }),

  defineMethod({
    name: 'orchestration.teamTriggersSet',
    params: TeamTriggersSetParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'change triggers')
      const triggerMode = params.triggerMode
        ? TEAM_TRIGGER_MODES.find((mode) => mode === params.triggerMode)
        : undefined
      if (params.triggerMode && !triggerMode) {
        throw new OrchestrationError(
          'invalid_argument',
          `Trigger mode must be one of ${TEAM_TRIGGER_MODES.join(', ')}.`
        )
      }
      db.setTeamTriggerSettings(team.id, {
        triggerMode,
        autoCompactTokens: params.autoCompactTokens,
        webhook: params.webhook
      })
      return triggerSettings(db.requireTeam(team.id))
    }
  }),

  defineMethod({
    name: 'orchestration.teamClosingTime',
    params: TeamClosingTimeParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'call closing time')
      if (params.cancel) {
        db.setTeamClosing(team.id, false)
        return { closing: false, notified: 0 }
      }
      const notified = beginTeamClosingTime(db, team, (member) =>
        Boolean(resolveLiveTeamMemberHandle(context.runtime, member))
      )
      return { closing: true, notified }
    }
  })
]
