import { OrchestrationError } from '../../orchestration-error'
import {
  TeamHireProposalRowSchema,
  type TeamHireProposalRow,
  type TeamHireProposalStatus,
  type TeamMemberRow
} from '../../team-types'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRow, queryTeamRows } from './team-row-query'
import type { TeamMemberFields } from './team-member-store'
import { assertTeamSlug } from './team-store'

export function createTeamHireProposal(
  this: OrchestrationDb,
  teamId: string,
  proposal: Omit<TeamMemberFields, 'isManager'> & {
    rationale?: string
    proposedByMemberId?: string | null
  }
): TeamHireProposalRow {
  const team = this.requireTeam(teamId)
  if (team.status === 'archived') {
    throw new OrchestrationError('team_conflict', `Team ${teamId} is archived.`, { teamId })
  }
  assertTeamSlug(proposal.slug, 'Member slug')
  assertTeamSlug(proposal.roleSlug, 'Role slug')
  if (this.findTeamMemberBySlug(teamId, proposal.slug)) {
    throw new OrchestrationError(
      'team_conflict',
      `Team ${team.name} already has a member "${proposal.slug}".`,
      { teamId, slug: proposal.slug }
    )
  }
  const id = generateId('hire')
  this.db
    .prepare(
      `INSERT INTO team_hire_proposals (
         id, team_id, proposed_by_member_id, slug, display_name, role_slug, role_brief,
         agent, model, effort, rationale
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      teamId,
      proposal.proposedByMemberId ?? null,
      proposal.slug,
      proposal.displayName?.trim() || proposal.slug,
      proposal.roleSlug,
      proposal.roleBrief?.trim() ?? '',
      proposal.agent.trim(),
      proposal.model ?? null,
      proposal.effort ?? null,
      proposal.rationale?.trim() ?? ''
    )
  return this.requireTeamHireProposal(id)
}

export function requireTeamHireProposal(this: OrchestrationDb, id: string): TeamHireProposalRow {
  const row = queryTeamRow(
    this.db,
    TeamHireProposalRowSchema,
    'SELECT * FROM team_hire_proposals WHERE id = ?',
    id
  )
  if (!row) {
    throw new OrchestrationError('team_proposal_not_found', `Hire proposal ${id} was not found.`, {
      proposalId: id
    })
  }
  return row
}

export function listTeamHireProposals(
  this: OrchestrationDb,
  teamId: string,
  status?: TeamHireProposalStatus
): TeamHireProposalRow[] {
  if (status) {
    return queryTeamRows(
      this.db,
      TeamHireProposalRowSchema,
      'SELECT * FROM team_hire_proposals WHERE team_id = ? AND status = ? ORDER BY created_at, rowid',
      teamId,
      status
    )
  }
  return queryTeamRows(
    this.db,
    TeamHireProposalRowSchema,
    'SELECT * FROM team_hire_proposals WHERE team_id = ? ORDER BY created_at, rowid',
    teamId
  )
}

/**
 * Settles a pending proposal. Approval adds the member in the same transaction so a crash never
 * leaves an approved proposal without its member.
 */
export function decideTeamHireProposal(
  this: OrchestrationDb,
  id: string,
  decision: 'approved' | 'rejected' | 'withdrawn',
  note?: string
): { proposal: TeamHireProposalRow; member: TeamMemberRow | null } {
  this.db.exec('SAVEPOINT decide_team_hire')
  try {
    const proposal = this.requireTeamHireProposal(id)
    if (proposal.status !== 'pending') {
      throw new OrchestrationError(
        'team_conflict',
        `Hire proposal ${id} is already ${proposal.status}.`,
        { proposalId: id, status: proposal.status }
      )
    }
    const member =
      decision === 'approved'
        ? this.addTeamMember(proposal.team_id, {
            slug: proposal.slug,
            displayName: proposal.display_name,
            roleSlug: proposal.role_slug,
            roleBrief: proposal.role_brief,
            agent: proposal.agent,
            model: proposal.model,
            effort: proposal.effort
          })
        : null
    this.db
      .prepare(
        `UPDATE team_hire_proposals
         SET status = ?, decision_note = ?, member_id = ?, decided_at = datetime('now')
         WHERE id = ?`
      )
      .run(decision, note?.trim() || null, member?.id ?? null, id)
    const settled = this.requireTeamHireProposal(id)
    this.db.exec('RELEASE decide_team_hire')
    return { proposal: settled, member }
  } catch (error) {
    this.db.exec('ROLLBACK TO decide_team_hire')
    this.db.exec('RELEASE decide_team_hire')
    throw error
  }
}

export type TeamHireProposalStoreMethods = {
  createTeamHireProposal: typeof createTeamHireProposal
  requireTeamHireProposal: typeof requireTeamHireProposal
  listTeamHireProposals: typeof listTeamHireProposals
  decideTeamHireProposal: typeof decideTeamHireProposal
}

export function attachTeamHireProposalStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    createTeamHireProposal,
    requireTeamHireProposal,
    listTeamHireProposals,
    decideTeamHireProposal
  })
}
