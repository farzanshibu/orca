import {
  TeamHireDecideParams,
  TeamHireProposeParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { requireTeamOperator, resolveTeamCaller } from '../../../team/team-caller-authority'
import { assertTeamMemberLaunchable, startTeamMember } from '../../../team/team-member-lifecycle'
import { projectTeamMember } from '../../../team/team-snapshot'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

const HIRE_DECISIONS = ['approved', 'rejected', 'withdrawn'] as const

function parseHireDecision(value: string): (typeof HIRE_DECISIONS)[number] {
  const normalized = value === 'approve' ? 'approved' : value === 'reject' ? 'rejected' : value
  const decision = HIRE_DECISIONS.find((candidate) => candidate === normalized)
  if (!decision) {
    throw new OrchestrationError('invalid_argument', '--decision must be approve or reject.')
  }
  return decision
}

export const TEAM_HIRE_METHODS = [
  defineMethod({
    name: 'orchestration.teamHirePropose',
    params: TeamHireProposeParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const caller = resolveTeamCaller(context, db, team)
      // Why only the manager: workers asking to grow the team go through the manager first.
      if (caller.kind === 'member' && !caller.isManager) {
        throw new OrchestrationError(
          'consumer_fenced',
          `Only the manager of ${team.name} can propose hires; ask it instead.`
        )
      }
      assertTeamMemberLaunchable(params)
      const proposal = db.createTeamHireProposal(team.id, {
        slug: params.slug,
        displayName: params.displayName,
        roleSlug: params.role,
        roleBrief: params.brief,
        agent: params.agent,
        model: params.model ?? null,
        effort: params.effort ?? null,
        rationale: params.rationale,
        proposedByMemberId: caller.kind === 'member' ? caller.member.id : null
      })
      return { proposal }
    }
  }),

  defineMethod({
    name: 'orchestration.teamHireDecide',
    params: TeamHireDecideParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      requireTeamOperator(resolveTeamCaller(context, db, team), 'approve or reject hires')
      const pending = db.requireTeamHireProposal(params.id)
      if (pending.team_id !== team.id) {
        throw new OrchestrationError(
          'team_proposal_not_found',
          `Hire proposal ${params.id} was not found in team ${team.name}.`
        )
      }
      const decided = db.decideTeamHireProposal(
        pending.id,
        parseHireDecision(params.decision),
        params.note
      )
      const member =
        decided.member && params.start
          ? await startTeamMember({ context, db, team, member: decided.member })
          : decided.member
      return {
        proposal: decided.proposal,
        member: member ? projectTeamMember(context.runtime, member) : null
      }
    }
  })
]
