import { isValidTeamSlug } from '../../../../../shared/team-slug'
import { OrchestrationError } from '../../orchestration-error'
import { TeamRowSchema, type TeamRow, type TeamStatus } from '../../team-types'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'
import { createTeamActivityTriggers } from './team-activity-triggers'
import { queryTeamRow, queryTeamRows } from './team-row-query'

export function createTeam(
  this: OrchestrationDb,
  params: { repoId: string; name: string; charter?: string }
): TeamRow {
  const name = params.name.trim()
  if (!name) {
    throw new OrchestrationError('invalid_argument', 'A team needs a name.')
  }
  if (this.findTeamByName(params.repoId, name)) {
    throw new OrchestrationError(
      'team_conflict',
      `Team "${name}" already exists for this repository.`,
      { repoId: params.repoId, name }
    )
  }
  // Why a Run per team: members reuse Run-scoped mail, tasks, gates, and group fan-out unchanged.
  const run = this.createRun({
    objective: `Team ${name}`,
    coordinatorHandle: null,
    coordinatorPaneKey: null
  })
  const id = generateId('team')
  this.db
    .prepare(
      'INSERT INTO teams (id, repo_id, name, run_id, charter, task_prefix) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, params.repoId, name, run.id, params.charter?.trim() ?? '', teamTaskPrefix(name))
  // The first team is what gives a database the activity triggers.
  createTeamActivityTriggers(this.db)
  return this.requireTeam(id)
}

/** `Big Money Team` -> `bmt`; a one-word name keeps its first three letters. */
export function teamTaskPrefix(name: string): string {
  const words = name.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const prefix =
    words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? '').slice(0, 3)
  return prefix.slice(0, 6) || 'task'
}

export function getTeam(this: OrchestrationDb, id: string): TeamRow | undefined {
  return queryTeamRow(this.db, TeamRowSchema, 'SELECT * FROM teams WHERE id = ?', id)
}

export function requireTeam(this: OrchestrationDb, id: string): TeamRow {
  const team = this.getTeam(id)
  if (!team) {
    throw new OrchestrationError('team_not_found', `Team ${id} was not found.`, { teamId: id })
  }
  return team
}

export function findTeamByName(
  this: OrchestrationDb,
  repoId: string,
  name: string
): TeamRow | undefined {
  return queryTeamRow(
    this.db,
    TeamRowSchema,
    "SELECT * FROM teams WHERE repo_id = ? AND name = ? AND status != 'archived'",
    repoId,
    name
  )
}

export function getTeamByRunId(this: OrchestrationDb, runId: string): TeamRow | undefined {
  return queryTeamRow(this.db, TeamRowSchema, 'SELECT * FROM teams WHERE run_id = ?', runId)
}

export function listTeams(
  this: OrchestrationDb,
  filter?: { repoId?: string; includeArchived?: boolean }
): TeamRow[] {
  const clauses: string[] = []
  const args: string[] = []
  if (filter?.repoId) {
    clauses.push('repo_id = ?')
    args.push(filter.repoId)
  }
  if (!filter?.includeArchived) {
    clauses.push("status != 'archived'")
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  return queryTeamRows(
    this.db,
    TeamRowSchema,
    `SELECT * FROM teams ${where} ORDER BY created_at, rowid`,
    ...args
  )
}

export function updateTeam(
  this: OrchestrationDb,
  id: string,
  patch: { charter?: string; status?: TeamStatus; maxParallel?: number | null }
): TeamRow {
  const team = this.requireTeam(id)
  if (team.status === 'archived' && patch.status !== undefined && patch.status !== 'archived') {
    throw new OrchestrationError('team_conflict', `Team ${id} is archived.`, { teamId: id })
  }
  this.db
    .prepare(
      `UPDATE teams SET charter = ?, status = ?, max_parallel = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      patch.charter?.trim() ?? team.charter,
      patch.status ?? team.status,
      patch.maxParallel === undefined ? team.max_parallel : patch.maxParallel,
      id
    )
  return this.requireTeam(id)
}

/** Resolves a team by id, or by name within a repo; the CLI and UI accept either. */
export function resolveTeamSelector(
  this: OrchestrationDb,
  selector: string,
  repoId?: string
): TeamRow {
  const byId = this.getTeam(selector)
  if (byId) {
    return byId
  }
  const matches = this.listTeams(repoId ? { repoId } : undefined).filter(
    (team) => team.name === selector
  )
  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1) {
    throw new OrchestrationError(
      'invalid_argument',
      `Team name "${selector}" matches teams in several repositories; pass --repo or the team id.`
    )
  }
  throw new OrchestrationError('team_not_found', `Team ${selector} was not found.`, {
    team: selector
  })
}

export function assertTeamSlug(value: string, field: string): void {
  if (!isValidTeamSlug(value)) {
    throw new OrchestrationError(
      'invalid_argument',
      `${field} must be 1-40 lowercase letters, digits, or dashes, starting with a letter or digit.`
    )
  }
}

export type TeamStoreMethods = {
  createTeam: typeof createTeam
  getTeam: typeof getTeam
  requireTeam: typeof requireTeam
  findTeamByName: typeof findTeamByName
  getTeamByRunId: typeof getTeamByRunId
  listTeams: typeof listTeams
  updateTeam: typeof updateTeam
  resolveTeamSelector: typeof resolveTeamSelector
}

export function attachTeamStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    createTeam,
    getTeam,
    requireTeam,
    findTeamByName,
    getTeamByRunId,
    listTeams,
    updateTeam,
    resolveTeamSelector
  })
}
