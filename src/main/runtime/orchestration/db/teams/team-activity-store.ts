import { z } from 'zod'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRow, queryTeamRows } from './team-row-query'

const nullableText = z.string().nullable()

const TeamActivityRowSchema = z.object({
  sequence: z.number(),
  team_id: z.string(),
  kind: z.string(),
  channel: nullableText,
  status: nullableText,
  message_id: nullableText,
  message_type: nullableText,
  task_id: nullableText,
  dispatch_id: nullableText,
  thread_id: nullableText,
  from_party: z.string(),
  from_member_id: nullableText,
  to_party: z.string(),
  to_member_id: nullableText,
  subject: z.string(),
  detail: nullableText,
  created_at: z.string()
})
export type TeamActivityRow = z.infer<typeof TeamActivityRowSchema>

export type TeamActivityParticipant = { party: string; memberId?: string | null }

/** What Orca's own code records; mail, tasks, and dispatches are recorded by triggers instead. */
export type TeamActivityInput = {
  teamId: string
  kind: string
  channel?: 'queue' | 'direct'
  status?: string
  taskId?: string
  from: TeamActivityParticipant
  to: TeamActivityParticipant
  subject: string
  detail?: string | null
}

/** The feed is for watching work happen, not an archive; the mail and task rows stay durable. */
export const TEAM_ACTIVITY_RETENTION = { maxAgeDays: 30, maxRowsPerTeam: 20_000 }

const SUBJECT_MAX = 160
const DETAIL_MAX = 280

/** The first line of free text, short enough for a feed row. */
export function teamActivitySubject(text: string): string {
  return (text.trim().split('\n')[0] ?? '').slice(0, SUBJECT_MAX)
}

export function recordTeamActivity(this: OrchestrationDb, input: TeamActivityInput): void {
  this.db
    .prepare(
      `INSERT INTO team_activity (
         team_id, kind, channel, status, task_id, from_party, from_member_id, to_party,
         to_member_id, subject, detail
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.teamId,
      input.kind,
      input.channel ?? null,
      input.status ?? null,
      input.taskId ?? null,
      input.from.party,
      input.from.memberId ?? null,
      input.to.party,
      input.to.memberId ?? null,
      input.subject.slice(0, SUBJECT_MAX),
      input.detail ? input.detail.slice(0, DETAIL_MAX) : null
    )
}

/** Without a cursor: the newest `limit` rows. With one: the rows after it. Oldest first either way. */
export function listTeamActivity(
  this: OrchestrationDb,
  teamId: string,
  options: { afterSequence?: number; limit: number }
): TeamActivityRow[] {
  if (options.afterSequence === undefined) {
    return queryTeamRows(
      this.db,
      TeamActivityRowSchema,
      'SELECT * FROM team_activity WHERE team_id = ? ORDER BY sequence DESC LIMIT ?',
      teamId,
      options.limit
    ).toReversed()
  }
  return queryTeamRows(
    this.db,
    TeamActivityRowSchema,
    'SELECT * FROM team_activity WHERE team_id = ? AND sequence > ? ORDER BY sequence LIMIT ?',
    teamId,
    options.afterSequence,
    options.limit
  )
}

export function getLatestTeamActivitySequence(this: OrchestrationDb, teamId: string): number {
  const row = queryTeamRow(
    this.db,
    z.object({ sequence: z.number().nullable() }),
    'SELECT MAX(sequence) AS sequence FROM team_activity WHERE team_id = ?',
    teamId
  )
  return row?.sequence ?? 0
}

/** Says who really sent a message the mailbox filed under another address, such as the operator's answer. */
export function attributeTeamActivityMessage(
  this: OrchestrationDb,
  messageId: string,
  from: TeamActivityParticipant
): void {
  this.db
    .prepare(
      `UPDATE team_activity SET from_party = ?, from_member_id = ?
       WHERE message_id = ? AND kind = 'message'`
    )
    .run(from.party, from.memberId ?? null, messageId)
}

/** Says who resolved a task's gate when it was not the Run's manager, such as the operator's inbox. */
export function attributeTeamGateResolution(
  this: OrchestrationDb,
  taskId: string,
  from: TeamActivityParticipant
): void {
  this.db
    .prepare(
      `UPDATE team_activity SET from_party = ?, from_member_id = ?
       WHERE sequence = (
         SELECT MAX(sequence) FROM team_activity WHERE kind = 'gate_resolved' AND task_id = ?
       )`
    )
    .run(from.party, from.memberId ?? null, taskId)
}

/**
 * Drops activity older than `maxAgeDays` and beyond the newest `maxRowsPerTeam`, and remembers
 * how far it pruned so a poll cursor from before then restarts instead of silently skipping.
 */
export function pruneTeamActivity(
  this: OrchestrationDb,
  limits: { maxAgeDays: number; maxRowsPerTeam: number }
): number {
  let removed = 0
  for (const team of this.listTeams({ includeArchived: true })) {
    const cutoff = queryTeamRow(
      this.db,
      z.object({ sequence: z.number().nullable() }),
      `SELECT MAX(sequence) AS sequence FROM team_activity
       WHERE team_id = ? AND (
         created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
         OR sequence <= (
           SELECT sequence FROM team_activity WHERE team_id = ?
           ORDER BY sequence DESC LIMIT 1 OFFSET ?
         )
       )`,
      team.id,
      `-${limits.maxAgeDays} days`,
      team.id,
      limits.maxRowsPerTeam
    )?.sequence
    if (!cutoff) {
      continue
    }
    removed += Number(
      this.db
        .prepare('DELETE FROM team_activity WHERE team_id = ? AND sequence <= ?')
        .run(team.id, cutoff).changes
    )
    this.db
      .prepare(
        'UPDATE teams SET activity_pruned_through = MAX(activity_pruned_through, ?) WHERE id = ?'
      )
      .run(cutoff, team.id)
  }
  return removed
}

export type TeamActivityStoreMethods = {
  recordTeamActivity: typeof recordTeamActivity
  listTeamActivity: typeof listTeamActivity
  getLatestTeamActivitySequence: typeof getLatestTeamActivitySequence
  attributeTeamActivityMessage: typeof attributeTeamActivityMessage
  attributeTeamGateResolution: typeof attributeTeamGateResolution
  pruneTeamActivity: typeof pruneTeamActivity
}

export function attachTeamActivityStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    recordTeamActivity,
    listTeamActivity,
    getLatestTeamActivitySequence,
    attributeTeamActivityMessage,
    attributeTeamGateResolution,
    pruneTeamActivity
  })
}
