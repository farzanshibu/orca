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

export type TeamInboxStoreMethods = {
  listPendingTeamQuestions: typeof listPendingTeamQuestions
  listRecentTeamMessages: typeof listRecentTeamMessages
}

export function attachTeamInboxStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    listPendingTeamQuestions,
    listRecentTeamMessages
  })
}
