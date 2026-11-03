import {
  TeamMemberAddParams,
  TeamMemberCapParams,
  TeamMemberParams,
  TeamMemberSendParams,
  TeamMemberUpdateParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import {
  requireTeamOperator,
  requireTeamOperatorOrManager,
  resolveTeamCaller
} from '../../../team/team-caller-authority'
import {
  assertTeamMemberLaunchable,
  sendToTeamMember,
  startTeamMember,
  stopTeamMember
} from '../../../team/team-member-lifecycle'
import { projectTeamMember } from '../../../team/team-snapshot'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

export const TEAM_MEMBER_METHODS = [
  defineMethod({
    name: 'orchestration.teamMemberAdd',
    params: TeamMemberAddParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'hire members directly')
      assertTeamMemberLaunchable(params)
      const member = db.addTeamMember(team.id, {
        slug: params.slug,
        displayName: params.displayName,
        roleSlug: params.role,
        roleBrief: params.brief,
        agent: params.agent,
        model: params.model ?? null,
        effort: params.effort ?? null,
        isManager: params.manager,
        capabilities: params.capabilities
      })
      return { member: projectTeamMember(context.runtime, member) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberUpdate',
    params: TeamMemberUpdateParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'change members')
      const current = db.resolveTeamMemberSelector(team.id, params.member)
      assertTeamMemberLaunchable({
        agent: params.agent ?? current.agent,
        model: params.model ?? current.model,
        effort: params.effort ?? current.effort
      })
      const member = db.updateTeamMember(current.id, {
        displayName: params.displayName,
        roleSlug: params.role,
        roleBrief: params.brief,
        agent: params.agent,
        model: params.model,
        effort: params.effort
      })
      return { member: projectTeamMember(context.runtime, member) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberRemove',
    params: TeamMemberParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'remove members')
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      await stopTeamMember({ runtime: context.runtime, db, member })
      return { member: db.archiveTeamMember(member.id) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberStart',
    params: TeamMemberParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'start members')
      if (team.status === 'paused') {
        throw new OrchestrationError('team_paused', `Team ${team.name} is paused; resume it first.`)
      }
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      const started = await startTeamMember({ context, db, team, member })
      return { member: projectTeamMember(context.runtime, started) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberStop',
    params: TeamMemberParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'stop members')
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      const stopped = await stopTeamMember({ runtime: context.runtime, db, member })
      return { member: projectTeamMember(context.runtime, stopped) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberPause',
    params: TeamMemberParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'pause members')
      const member = db.setTeamMemberPaused(
        db.resolveTeamMemberSelector(team.id, params.member).id,
        true
      )
      return { member: projectTeamMember(context.runtime, member) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberResume',
    params: TeamMemberParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'resume members')
      const member = db.setTeamMemberPaused(
        db.resolveTeamMemberSelector(team.id, params.member).id,
        false
      )
      return { member: projectTeamMember(context.runtime, member) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberSetCap',
    params: TeamMemberCapParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'change spend caps')
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      db.setTeamMemberSpendCap(member.id, params.capUsd, params.tokenCap)
      return { member: projectTeamMember(context.runtime, db.requireTeamMember(member.id)) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberSend',
    params: TeamMemberSendParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const caller = resolveTeamCaller(context, db, team)
      requireTeamOperatorOrManager(caller, 'steer other members')
      if (params.interrupt) {
        requireTeamOperator(caller, 'interrupt members')
      }
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      if (member.paused_at && caller.kind !== 'operator') {
        throw new OrchestrationError(
          'team_paused',
          `Team member ${member.slug} is paused by the operator.`
        )
      }
      return sendToTeamMember({ context, member, text: params.text, interrupt: params.interrupt })
    }
  })
]
