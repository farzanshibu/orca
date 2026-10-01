import {
  TeamMemberAddParams,
  TeamMemberCapParams,
  TeamMemberParams,
  TeamMemberSendParams,
  TeamMemberUpdateParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import { teamActivitySubject } from '../../../orchestration/db/teams/team-activity-store'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import {
  requireTeamOperator,
  requireTeamOperatorOrManager,
  resolveTeamCaller,
  teamCallerParticipant
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
      return { member: await projectTeamMember(context.runtime, member) }
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
      return { member: await projectTeamMember(context.runtime, member) }
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
      return { member: await projectTeamMember(context.runtime, started) }
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
      return { member: await projectTeamMember(context.runtime, stopped) }
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
      return { member: await projectTeamMember(context.runtime, member) }
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
      return { member: await projectTeamMember(context.runtime, member) }
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
      return { member: await projectTeamMember(context.runtime, db.requireTeamMember(member.id)) }
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
      const sent = await sendToTeamMember({
        context,
        member,
        text: params.text,
        interrupt: params.interrupt
      })
      // Typed straight into the pane, so no mail row exists for the feed to pick up.
      db.recordTeamActivity({
        teamId: team.id,
        kind: 'delivery',
        channel: 'direct',
        status: params.interrupt ? 'interrupted' : 'delivered',
        from: teamCallerParticipant(caller),
        to: { party: 'member', memberId: member.id },
        subject: teamActivitySubject(params.text)
      })
      return sent
    }
  })
]
