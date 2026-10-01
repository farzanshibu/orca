import { z } from 'zod'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRows } from './team-row-query'

const TeamPendingQuestionSchema = z.object({
  message_id: z.string(),
  dispatch_id: z.string(),
  asker_handle: z.string(),
  subject: z.string(),
  body: z.string(),
  payload: z.string().nullable(),
  created_at: z.string()
})
export type TeamPendingQuestion = z.infer<typeof TeamPendingQuestionSchema>

const TeamMessageLogEntrySchema = z.object({
  id: z.string(),
  from_handle: z.string(),
  to_handle: z.string(),
  subject: z.string(),
  body: z.string(),
  type: z.string(),
  priority: z.string(),
  thread_id: z.string().nullable(),
  read: z.number(),
  sequence: z.number(),
  created_at: z.string()
})
export type TeamMessageLogEntry = z.infer<typeof TeamMessageLogEntrySchema>

/** Asks from the team's workers that nobody has answered yet: the human's "waiting on you" queue. */
export function listPendingTeamQuestions(
  this: OrchestrationDb,
  runId: string
): TeamPendingQuestion[] {
  return queryTeamRows(
    this.db,
    TeamPendingQuestionSchema,
    `SELECT q.message_id, q.dispatch_id, q.asker_handle, m.subject, m.body, m.payload, q.created_at
     FROM question_threads q
     JOIN messages m ON m.id = q.message_id
     WHERE q.run_id = ? AND q.status = 'pending'
     ORDER BY q.created_at, m.sequence`,
    runId
  )
}

/** The team's mail, newest first: the routing log of who told whom what. */
export function listRecentTeamMessages(
  this: OrchestrationDb,
  runId: string,
  limit: number
): TeamMessageLogEntry[] {
  return queryTeamRows(
    this.db,
    TeamMessageLogEntrySchema,
    `SELECT id, from_handle, to_handle, subject, body, type, priority, thread_id, read, sequence,
       created_at
     FROM messages
     WHERE run_id = ? AND type != 'heartbeat'
     ORDER BY sequence DESC
     LIMIT ?`,
    runId,
    Math.max(1, Math.min(limit, 500))
  )
}

/**
 * Who sent each message of a thread that passed between two members who are not the manager,
 * oldest first. Read through the feed's rows because they name members, and handles change.
 */
export function listTeamPeerThreadSenders(
  this: OrchestrationDb,
  team: { id: string; run_id: string },
  threadId: string
): string[] {
  return queryTeamRows(
    this.db,
    z.object({ sender: z.string() }),
    `SELECT a.from_member_id AS sender
     FROM messages m
     JOIN team_activity a ON a.message_id = m.id AND a.kind = 'message' AND a.team_id = ?
     JOIN team_members f ON f.id = a.from_member_id AND f.is_manager = 0
     JOIN team_members t ON t.id = a.to_member_id AND t.is_manager = 0
     WHERE m.thread_id = ? AND m.run_id = ?
     ORDER BY m.sequence
     LIMIT 500`,
    team.id,
    threadId,
    team.run_id
  ).map((row) => row.sender)
}

/** Whether Orca already handed this thread to the manager. */
export function hasTeamThreadEscalation(
  this: OrchestrationDb,
  runId: string,
  threadId: string,
  payload: string
): boolean {
  return Boolean(
    this.db
      .prepare(
        `SELECT 1 FROM messages
         WHERE thread_id = ? AND run_id = ? AND type = 'escalation' AND payload = ? LIMIT 1`
      )
      .get(threadId, runId, payload)
  )
}

/**
 * Re-addresses a member's unread own-handle mail to the handle it has now. Found by the member the
 * feed recorded, not only by the previous handle, because stopping a member forgets its handle.
 */
export function moveTeamMemberDirectMail(
  this: OrchestrationDb,
  args: {
    team: { id: string; run_id: string }
    memberId: string
    previousHandle: string | null
    handle: string
  }
): number {
  const result = this.db
    .prepare(
      `UPDATE messages SET to_handle = ?
       WHERE run_id = ? AND read = 0 AND delivery_contract = 'current_delivery'
         AND to_handle <> ? AND to_handle NOT LIKE 'run:%' AND to_handle NOT LIKE 'dispatch:%'
         AND (to_handle = ? OR id IN (
           SELECT message_id FROM team_activity
           WHERE team_id = ? AND kind = 'message' AND to_member_id = ? AND message_id IS NOT NULL))`
    )
    .run(
      args.handle,
      args.team.run_id,
      args.handle,
      args.previousHandle ?? '',
      args.team.id,
      args.memberId
    )
  return Number(result.changes)
}

export type TeamInboxStoreMethods = {
  listPendingTeamQuestions: typeof listPendingTeamQuestions
  listRecentTeamMessages: typeof listRecentTeamMessages
  listTeamPeerThreadSenders: typeof listTeamPeerThreadSenders
  hasTeamThreadEscalation: typeof hasTeamThreadEscalation
  moveTeamMemberDirectMail: typeof moveTeamMemberDirectMail
}

export function attachTeamInboxStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    listPendingTeamQuestions,
    listRecentTeamMessages,
    listTeamPeerThreadSenders,
    hasTeamThreadEscalation,
    moveTeamMemberDirectMail
  })
}
