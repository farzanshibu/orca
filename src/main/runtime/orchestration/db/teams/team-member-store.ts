import type { TeamMemberCapabilities } from '../../../../../shared/team-capabilities'
import { OrchestrationError } from '../../orchestration-error'
import {
  TeamMemberRowSchema,
  type TeamMemberDesiredState,
  type TeamMemberRow
} from '../../team-types'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRow, queryTeamRows } from './team-row-query'
import { assertTeamSlug } from './team-store'

export type TeamMemberFields = {
  slug: string
  displayName?: string
  roleSlug: string
  roleBrief?: string
  agent: string
  model?: string | null
  effort?: string | null
  isManager?: boolean
  capabilities?: TeamMemberCapabilities
}

export function addTeamMember(
  this: OrchestrationDb,
  teamId: string,
  fields: TeamMemberFields
): TeamMemberRow {
  const team = this.requireTeam(teamId)
  if (team.status === 'archived') {
    throw new OrchestrationError('team_conflict', `Team ${teamId} is archived.`, { teamId })
  }
  assertTeamSlug(fields.slug, 'Member slug')
  assertTeamSlug(fields.roleSlug, 'Role slug')
  if (!fields.agent.trim()) {
    throw new OrchestrationError('invalid_argument', 'A team member needs an agent.')
  }
  if (this.findTeamMemberBySlug(teamId, fields.slug)) {
    throw new OrchestrationError(
      'team_conflict',
      `Team ${team.name} already has a member "${fields.slug}".`,
      { teamId, slug: fields.slug }
    )
  }
  if (fields.isManager && this.getTeamManager(teamId)) {
    throw new OrchestrationError('team_conflict', `Team ${team.name} already has a manager.`, {
      teamId
    })
  }
  const id = generateId('member')
  this.db
    .prepare(
      `INSERT INTO team_members (
         id, team_id, slug, display_name, role_slug, role_brief, agent, model, effort, is_manager,
         capabilities
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      teamId,
      fields.slug,
      fields.displayName?.trim() || fields.slug,
      fields.roleSlug,
      fields.roleBrief?.trim() ?? '',
      fields.agent.trim(),
      fields.model ?? null,
      fields.effort ?? null,
      fields.isManager ? 1 : 0,
      JSON.stringify(fields.capabilities ?? {})
    )
  return this.requireTeamMember(id)
}

export function getTeamMember(this: OrchestrationDb, id: string): TeamMemberRow | undefined {
  return queryTeamRow(this.db, TeamMemberRowSchema, 'SELECT * FROM team_members WHERE id = ?', id)
}

export function requireTeamMember(this: OrchestrationDb, id: string): TeamMemberRow {
  const member = this.getTeamMember(id)
  if (!member) {
    throw new OrchestrationError('team_member_not_found', `Team member ${id} was not found.`, {
      memberId: id
    })
  }
  return member
}

export function findTeamMemberBySlug(
  this: OrchestrationDb,
  teamId: string,
  slug: string
): TeamMemberRow | undefined {
  return queryTeamRow(
    this.db,
    TeamMemberRowSchema,
    'SELECT * FROM team_members WHERE team_id = ? AND slug = ? AND archived_at IS NULL',
    teamId,
    slug
  )
}

/** Resolves a member by id or by slug within the team. */
export function resolveTeamMemberSelector(
  this: OrchestrationDb,
  teamId: string,
  selector: string
): TeamMemberRow {
  const byId = this.getTeamMember(selector)
  if (byId && byId.team_id === teamId && byId.archived_at === null) {
    return byId
  }
  const bySlug = this.findTeamMemberBySlug(teamId, selector)
  if (bySlug) {
    return bySlug
  }
  throw new OrchestrationError('team_member_not_found', `Team member ${selector} was not found.`, {
    teamId,
    member: selector
  })
}

export function getTeamManager(this: OrchestrationDb, teamId: string): TeamMemberRow | undefined {
  return queryTeamRow(
    this.db,
    TeamMemberRowSchema,
    'SELECT * FROM team_members WHERE team_id = ? AND is_manager = 1 AND archived_at IS NULL',
    teamId
  )
}

export function listTeamMembers(
  this: OrchestrationDb,
  teamId: string,
  options?: { includeArchived?: boolean }
): TeamMemberRow[] {
  const archived = options?.includeArchived ? '' : 'AND archived_at IS NULL'
  return queryTeamRows(
    this.db,
    TeamMemberRowSchema,
    `SELECT * FROM team_members WHERE team_id = ? ${archived}
       ORDER BY is_manager DESC, created_at, rowid`,
    teamId
  )
}

/** The live member bound to a terminal handle, for sender attestation and role fan-out. */
export function findTeamMemberByTerminal(
  this: OrchestrationDb,
  terminalHandle: string
): TeamMemberRow | undefined {
  return queryTeamRow(
    this.db,
    TeamMemberRowSchema,
    'SELECT * FROM team_members WHERE terminal_handle = ? AND archived_at IS NULL LIMIT 1',
    terminalHandle
  )
}

export function updateTeamMember(
  this: OrchestrationDb,
  id: string,
  patch: Partial<Omit<TeamMemberFields, 'slug' | 'isManager'>>
): TeamMemberRow {
  const member = this.requireTeamMember(id)
  if (patch.roleSlug !== undefined) {
    assertTeamSlug(patch.roleSlug, 'Role slug')
  }
  this.db
    .prepare(
      `UPDATE team_members SET display_name = ?, role_slug = ?, role_brief = ?, agent = ?,
         model = ?, effort = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      patch.displayName?.trim() || member.display_name,
      patch.roleSlug ?? member.role_slug,
      patch.roleBrief?.trim() ?? member.role_brief,
      patch.agent?.trim() || member.agent,
      patch.model === undefined ? member.model : patch.model,
      patch.effort === undefined ? member.effort : patch.effort,
      id
    )
  return this.requireTeamMember(id)
}

export function setTeamMemberDesiredState(
  this: OrchestrationDb,
  id: string,
  desiredState: TeamMemberDesiredState
): TeamMemberRow {
  this.requireTeamMember(id)
  this.db
    .prepare("UPDATE team_members SET desired_state = ?, updated_at = datetime('now') WHERE id = ?")
    .run(desiredState, id)
  return this.requireTeamMember(id)
}

export function setTeamMemberPaused(
  this: OrchestrationDb,
  id: string,
  paused: boolean,
  reason?: string
): TeamMemberRow {
  this.requireTeamMember(id)
  this.db
    .prepare(
      `UPDATE team_members
       SET paused_at = CASE WHEN ? THEN COALESCE(paused_at, datetime('now')) ELSE NULL END,
           pause_reason = CASE WHEN ? THEN ? ELSE NULL END,
           updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(paused ? 1 : 0, paused ? 1 : 0, reason ?? null, id)
  return this.requireTeamMember(id)
}

export function bindTeamMemberTerminal(
  this: OrchestrationDb,
  id: string,
  binding: {
    worktreeId: string | null
    terminalHandle: string | null
    paneKey: string | null
    orcaSessionId?: string | null
  }
): TeamMemberRow {
  this.requireTeamMember(id)
  this.db
    .prepare(
      `UPDATE team_members SET worktree_id = ?, terminal_handle = ?, pane_key = ?,
         orca_session_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      binding.worktreeId,
      binding.terminalHandle,
      binding.paneKey,
      binding.orcaSessionId ?? null,
      id
    )
  return this.requireTeamMember(id)
}

export function archiveTeamMember(this: OrchestrationDb, id: string): TeamMemberRow {
  this.requireTeamMember(id)
  this.db
    .prepare(
      `UPDATE team_members SET archived_at = COALESCE(archived_at, datetime('now')),
         desired_state = 'stopped', is_manager = 0, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(id)
  return this.requireTeamMember(id)
}

export type TeamMemberStoreMethods = {
  addTeamMember: typeof addTeamMember
  getTeamMember: typeof getTeamMember
  requireTeamMember: typeof requireTeamMember
  findTeamMemberBySlug: typeof findTeamMemberBySlug
  resolveTeamMemberSelector: typeof resolveTeamMemberSelector
  getTeamManager: typeof getTeamManager
  listTeamMembers: typeof listTeamMembers
  findTeamMemberByTerminal: typeof findTeamMemberByTerminal
  updateTeamMember: typeof updateTeamMember
  setTeamMemberDesiredState: typeof setTeamMemberDesiredState
  setTeamMemberPaused: typeof setTeamMemberPaused
  bindTeamMemberTerminal: typeof bindTeamMemberTerminal
  archiveTeamMember: typeof archiveTeamMember
}

export function attachTeamMemberStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    addTeamMember,
    getTeamMember,
    requireTeamMember,
    findTeamMemberBySlug,
    resolveTeamMemberSelector,
    getTeamManager,
    listTeamMembers,
    findTeamMemberByTerminal,
    updateTeamMember,
    setTeamMemberDesiredState,
    setTeamMemberPaused,
    bindTeamMemberTerminal,
    archiveTeamMember
  })
}
