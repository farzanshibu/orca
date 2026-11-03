import { z } from 'zod'
import type { TeamMemberCapabilities } from '../../../../../shared/team-capabilities'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRows } from './team-row-query'

const TeamMemberSessionSchema = z.object({
  member_id: z.string(),
  provider: z.string(),
  session_id: z.string(),
  worktree_id: z.string().nullable(),
  first_seen_at: z.string()
})
export type TeamMemberSession = z.infer<typeof TeamMemberSessionSchema>

/** Idempotent: a session seen again keeps its first sighting. */
export function recordTeamMemberSession(
  this: OrchestrationDb,
  session: { memberId: string; provider: string; sessionId: string; worktreeId: string | null }
): void {
  this.db
    .prepare(
      `INSERT OR IGNORE INTO team_member_sessions (member_id, provider, session_id, worktree_id)
       VALUES (?, ?, ?, ?)`
    )
    .run(session.memberId, session.provider, session.sessionId, session.worktreeId)
}

export function listTeamMemberSessions(
  this: OrchestrationDb,
  memberId: string
): TeamMemberSession[] {
  return queryTeamRows(
    this.db,
    TeamMemberSessionSchema,
    'SELECT * FROM team_member_sessions WHERE member_id = ? ORDER BY first_seen_at, rowid',
    memberId
  )
}

/** Null clears the cap. */
export function setTeamMemberSpendCap(
  this: OrchestrationDb,
  id: string,
  capUsd: number | null,
  tokenCap?: number | null
): void {
  this.db
    .prepare(
      `UPDATE team_members SET spend_cap_usd = ?, token_cap = COALESCE(?, token_cap),
         updated_at = datetime('now') WHERE id = ?`
    )
    .run(capUsd, tokenCap ?? null, id)
  if (tokenCap === null) {
    this.db.prepare('UPDATE team_members SET token_cap = NULL WHERE id = ?').run(id)
  }
}

export function setTeamMemberSpend(
  this: OrchestrationDb,
  id: string,
  spend: { usd: number | null; tokens: number | null }
): void {
  this.db
    .prepare(
      `UPDATE team_members SET spend_usd = ?, spend_tokens = ?, spend_updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(spend.usd, spend.tokens, id)
}

export function setTeamMemberCapabilities(
  this: OrchestrationDb,
  id: string,
  capabilities: TeamMemberCapabilities
): void {
  this.db
    .prepare("UPDATE team_members SET capabilities = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(capabilities), id)
}

export type TeamMemberSpendStoreMethods = {
  recordTeamMemberSession: typeof recordTeamMemberSession
  listTeamMemberSessions: typeof listTeamMemberSessions
  setTeamMemberSpendCap: typeof setTeamMemberSpendCap
  setTeamMemberSpend: typeof setTeamMemberSpend
  setTeamMemberCapabilities: typeof setTeamMemberCapabilities
}

export function attachTeamMemberSpendStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    recordTeamMemberSession,
    listTeamMemberSessions,
    setTeamMemberSpendCap,
    setTeamMemberSpend,
    setTeamMemberCapabilities
  })
}
