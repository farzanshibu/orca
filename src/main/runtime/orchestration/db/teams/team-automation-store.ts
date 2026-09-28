import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  TeamMissionScheduleSchema,
  nextTeamMissionRun,
  type TeamMissionSchedule,
  type TeamTriggerMode
} from '../../../../../shared/team-mission-schedule'
import { OrchestrationError } from '../../orchestration-error'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRow, queryTeamRows } from './team-row-query'

const TeamMissionRowSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  name: z.string(),
  target: z.string(),
  prompt: z.string(),
  schedule: z.string(),
  enabled: z.number(),
  last_run_at: z.string().nullable(),
  next_run_at: z.string().nullable(),
  created_at: z.string()
})
export type TeamMissionRow = z.infer<typeof TeamMissionRowSchema>

/** SQLite-comparable UTC timestamp, matching `datetime('now')`. */
export function toSqliteUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export function parseTeamMissionSchedule(raw: string): TeamMissionSchedule | null {
  try {
    const parsed = TeamMissionScheduleSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function addTeamMission(
  this: OrchestrationDb,
  teamId: string,
  mission: { name: string; target: string; prompt: string; schedule: TeamMissionSchedule },
  now = new Date()
): TeamMissionRow {
  this.requireTeam(teamId)
  if (!mission.name.trim() || !mission.prompt.trim()) {
    throw new OrchestrationError('invalid_argument', 'A mission needs a name and a prompt.')
  }
  const id = generateId('mission')
  this.db
    .prepare(
      `INSERT INTO team_missions (id, team_id, name, target, prompt, schedule, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      teamId,
      mission.name.trim(),
      mission.target.trim() || 'manager',
      mission.prompt,
      JSON.stringify(mission.schedule),
      toSqliteUtc(nextTeamMissionRun(mission.schedule, now))
    )
  return this.requireTeamMission(id)
}

export function requireTeamMission(this: OrchestrationDb, id: string): TeamMissionRow {
  const row = queryTeamRow(
    this.db,
    TeamMissionRowSchema,
    'SELECT * FROM team_missions WHERE id = ?',
    id
  )
  if (!row) {
    throw new OrchestrationError('invalid_argument', `Mission ${id} was not found.`)
  }
  return row
}

export function listTeamMissions(this: OrchestrationDb, teamId: string): TeamMissionRow[] {
  return queryTeamRows(
    this.db,
    TeamMissionRowSchema,
    'SELECT * FROM team_missions WHERE team_id = ? ORDER BY created_at, rowid',
    teamId
  )
}

export function listDueTeamMissions(this: OrchestrationDb, now: Date): TeamMissionRow[] {
  return queryTeamRows(
    this.db,
    TeamMissionRowSchema,
    `SELECT m.* FROM team_missions m JOIN teams t ON t.id = m.team_id
     WHERE m.enabled = 1 AND t.status = 'active' AND m.next_run_at IS NOT NULL
       AND m.next_run_at <= ?
     ORDER BY m.next_run_at`,
    toSqliteUtc(now)
  )
}

export function setTeamMissionEnabled(
  this: OrchestrationDb,
  id: string,
  enabled: boolean,
  now = new Date()
): TeamMissionRow {
  const mission = this.requireTeamMission(id)
  const schedule = parseTeamMissionSchedule(mission.schedule)
  // Re-enabling schedules from now, so a mission paused for a week does not fire a backlog.
  const next = enabled && schedule ? toSqliteUtc(nextTeamMissionRun(schedule, now)) : null
  this.db
    .prepare('UPDATE team_missions SET enabled = ?, next_run_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, next, id)
  return this.requireTeamMission(id)
}

export function recordTeamMissionRun(this: OrchestrationDb, id: string, now: Date): void {
  const mission = this.requireTeamMission(id)
  const schedule = parseTeamMissionSchedule(mission.schedule)
  this.db
    .prepare('UPDATE team_missions SET last_run_at = ?, next_run_at = ? WHERE id = ?')
    .run(toSqliteUtc(now), schedule ? toSqliteUtc(nextTeamMissionRun(schedule, now)) : null, id)
}

export function removeTeamMission(this: OrchestrationDb, id: string): void {
  this.db.prepare('DELETE FROM team_missions WHERE id = ?').run(id)
}

export function setTeamTriggerSettings(
  this: OrchestrationDb,
  teamId: string,
  settings: {
    triggerMode?: TeamTriggerMode
    autoCompactTokens?: number | null
    webhook?: 'enable' | 'disable' | 'rotate'
  }
): void {
  const team = this.requireTeam(teamId)
  const token =
    settings.webhook === 'disable'
      ? null
      : settings.webhook === 'rotate' || (settings.webhook === 'enable' && !team.webhook_token)
        ? randomBytes(24).toString('base64url')
        : team.webhook_token
  this.db
    .prepare(
      `UPDATE teams SET trigger_mode = ?, auto_compact_tokens = ?, webhook_token = ?,
         updated_at = datetime('now') WHERE id = ?`
    )
    .run(
      settings.triggerMode ?? team.trigger_mode,
      settings.autoCompactTokens === undefined
        ? team.auto_compact_tokens
        : settings.autoCompactTokens,
      token,
      teamId
    )
}

export function setTeamClosing(this: OrchestrationDb, teamId: string, closing: boolean): void {
  this.requireTeam(teamId)
  this.db
    .prepare(
      `UPDATE teams SET closing_at = CASE WHEN ? THEN datetime('now') ELSE NULL END,
         updated_at = datetime('now') WHERE id = ?`
    )
    .run(closing ? 1 : 0, teamId)
}

export function markTeamMemberCompacted(
  this: OrchestrationDb,
  memberId: string,
  tokens: number
): void {
  this.db
    .prepare('UPDATE team_members SET compacted_at_tokens = ? WHERE id = ?')
    .run(tokens, memberId)
}

export type TeamAutomationStoreMethods = {
  addTeamMission: typeof addTeamMission
  requireTeamMission: typeof requireTeamMission
  listTeamMissions: typeof listTeamMissions
  listDueTeamMissions: typeof listDueTeamMissions
  setTeamMissionEnabled: typeof setTeamMissionEnabled
  recordTeamMissionRun: typeof recordTeamMissionRun
  removeTeamMission: typeof removeTeamMission
  setTeamTriggerSettings: typeof setTeamTriggerSettings
  markTeamMemberCompacted: typeof markTeamMemberCompacted
  setTeamClosing: typeof setTeamClosing
}

export function attachTeamAutomationStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    addTeamMission,
    requireTeamMission,
    listTeamMissions,
    listDueTeamMissions,
    setTeamMissionEnabled,
    recordTeamMissionRun,
    removeTeamMission,
    setTeamTriggerSettings,
    markTeamMemberCompacted,
    setTeamClosing
  })
}
