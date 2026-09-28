import {
  TeamMemberCapabilitiesParams,
  TeamMemberImportParams,
  TeamMemberParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import {
  TEAM_HIRE_TEMPLATE_SPEC,
  parseTeamMemberCapabilities,
  type TeamHireTemplate
} from '../../../../../shared/team-capabilities'
import { toTeamSlug } from '../../../../../shared/team-slug'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { requireTeamOperator, resolveTeamCaller } from '../../../team/team-caller-authority'
import { assertTeamMemberLaunchable } from '../../../team/team-member-lifecycle'
import { projectTeamMember } from '../../../team/team-snapshot'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

export const TEAM_CAPABILITY_METHODS = [
  defineMethod({
    name: 'orchestration.teamMemberSetCapabilities',
    params: TeamMemberCapabilitiesParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'grant capabilities')
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      db.setTeamMemberCapabilities(member.id, params.capabilities)
      // Grants reach the agent's files and brief on its next start.
      return { member: projectTeamMember(context.runtime, db.requireTeamMember(member.id)) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberExport',
    params: TeamMemberParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const member = db.resolveTeamMemberSelector(team.id, params.member)
      const template: TeamHireTemplate = {
        spec: TEAM_HIRE_TEMPLATE_SPEC,
        name: member.display_name,
        role: member.role_slug,
        brief: member.role_brief,
        agent: member.agent,
        ...(member.model ? { model: member.model } : {}),
        ...(member.effort ? { effort: member.effort } : {}),
        capabilities: parseTeamMemberCapabilities(member.capabilities)
      }
      return { template }
    }
  }),

  defineMethod({
    name: 'orchestration.teamMemberImport',
    params: TeamMemberImportParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'hire members directly')
      const { template } = params
      const slug = params.slug ?? toTeamSlug(template.name)
      const roleSlug = toTeamSlug(template.role)
      if (!slug || !roleSlug) {
        throw new OrchestrationError(
          'invalid_argument',
          'The template needs a usable name and role.'
        )
      }
      assertTeamMemberLaunchable(template)
      const member = db.addTeamMember(team.id, {
        slug,
        displayName: template.name,
        roleSlug,
        roleBrief: template.brief,
        agent: template.agent,
        model: template.model ?? null,
        effort: template.effort ?? null,
        capabilities: template.capabilities
      })
      return { member: projectTeamMember(context.runtime, member) }
    }
  })
]
