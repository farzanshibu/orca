import { z } from 'zod'
import { OrchestrationError } from '../../orchestration-error'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'
import { queryTeamRow, queryTeamRows } from './team-row-query'

const TeamQueueItemSchema = z.object({
  id: z.string(),
  member_id: z.string(),
  text: z.string(),
  position: z.number(),
  created_at: z.string(),
  delivered_at: z.string().nullable(),
  failed_reason: z.string().nullable()
})
export type TeamQueueItem = z.infer<typeof TeamQueueItemSchema>

const TaskRefSchema = z.object({ task_id: z.string(), number: z.number() })

/**
 * Short refs (`bmt-12`) for every task in the team's Run, numbering new ones in creation order.
 * Why lazily at read: tasks enter the Run through many writers (task-create, worker-start, gates),
 * and numbering them here keeps every one of those paths unchanged.
 */
export function assignTeamTaskRefs(this: OrchestrationDb, teamId: string): Map<string, string> {
  const team = this.requireTeam(teamId)
  this.db.exec('SAVEPOINT team_task_refs')
  try {
    const unnumbered = queryTeamRows(
      this.db,
      z.object({ id: z.string() }),
      `SELECT t.id FROM tasks t
       LEFT JOIN team_task_refs r ON r.task_id = t.id
       WHERE t.run_id = ? AND r.task_id IS NULL
       ORDER BY t.created_at, t.rowid`,
      team.run_id
    )
    let counter = team.task_counter
    const insert = this.db.prepare(
      'INSERT INTO team_task_refs (task_id, team_id, number) VALUES (?, ?, ?)'
    )
    for (const task of unnumbered) {
      counter += 1
      insert.run(task.id, teamId, counter)
    }
    if (counter !== team.task_counter) {
      this.db.prepare('UPDATE teams SET task_counter = ? WHERE id = ?').run(counter, teamId)
    }
    this.db.exec('RELEASE team_task_refs')
  } catch (error) {
    this.db.exec('ROLLBACK TO team_task_refs')
    this.db.exec('RELEASE team_task_refs')
    throw error
  }
  const refs = queryTeamRows(
    this.db,
    TaskRefSchema,
    'SELECT task_id, number FROM team_task_refs WHERE team_id = ?',
    teamId
  )
  return new Map(refs.map((ref) => [ref.task_id, `${team.task_prefix}-${ref.number}`]))
}

/** Resolves `bmt-12` (or a raw task id) to the task id within the team. */
export function resolveTeamTaskRef(this: OrchestrationDb, teamId: string, ref: string): string {
  // Number first: a task filed since the last read has no ref row yet.
  this.assignTeamTaskRefs(teamId)
  const team = this.requireTeam(teamId)
  const match = new RegExp(`^${team.task_prefix}-(\\d+)$`, 'i').exec(ref.trim())
  const row = match
    ? queryTeamRow(
        this.db,
        TaskRefSchema,
        'SELECT task_id, number FROM team_task_refs WHERE team_id = ? AND number = ?',
        teamId,
        Number(match[1])
      )
    : undefined
  return row?.task_id ?? ref
}

export function enqueueTeamMemberMessage(
  this: OrchestrationDb,
  memberId: string,
  text: string
): TeamQueueItem {
  this.requireTeamMember(memberId)
  if (!text.trim()) {
    throw new OrchestrationError('invalid_argument', 'A queued message needs text.')
  }
  const last = queryTeamRow(
    this.db,
    z.object({ position: z.number().nullable() }),
    'SELECT MAX(position) AS position FROM team_member_queue WHERE member_id = ?',
    memberId
  )
  const id = generateId('queue')
  this.db
    .prepare('INSERT INTO team_member_queue (id, member_id, text, position) VALUES (?, ?, ?, ?)')
    .run(id, memberId, text, (last?.position ?? 0) + 1)
  return this.requireTeamQueueItem(id)
}

export function requireTeamQueueItem(this: OrchestrationDb, id: string): TeamQueueItem {
  const item = queryTeamRow(
    this.db,
    TeamQueueItemSchema,
    'SELECT * FROM team_member_queue WHERE id = ?',
    id
  )
  if (!item) {
    throw new OrchestrationError('invalid_argument', `Queued message ${id} was not found.`)
  }
  return item
}

export function listPendingTeamQueue(this: OrchestrationDb, memberId: string): TeamQueueItem[] {
  return queryTeamRows(
    this.db,
    TeamQueueItemSchema,
    `SELECT * FROM team_member_queue
     WHERE member_id = ? AND delivered_at IS NULL AND failed_reason IS NULL
     ORDER BY position, rowid`,
    memberId
  )
}

/** Reorders the member's pending queue to `orderedIds`; ids not named keep their relative order after them. */
export function reorderTeamQueue(
  this: OrchestrationDb,
  memberId: string,
  orderedIds: readonly string[]
): TeamQueueItem[] {
  const pending = this.listPendingTeamQueue(memberId)
  const known = new Set(pending.map((item) => item.id))
  const unknown = orderedIds.filter((id) => !known.has(id))
  if (unknown.length > 0) {
    throw new OrchestrationError(
      'invalid_argument',
      `Not pending for this member: ${unknown.join(', ')}.`
    )
  }
  const named = new Set(orderedIds)
  const order = [...orderedIds, ...pending.filter((item) => !named.has(item.id)).map((i) => i.id)]
  const update = this.db.prepare('UPDATE team_member_queue SET position = ? WHERE id = ?')
  order.forEach((id, index) => update.run(index + 1, id))
  return this.listPendingTeamQueue(memberId)
}

export function removeTeamQueueItem(this: OrchestrationDb, id: string): void {
  this.db.prepare('DELETE FROM team_member_queue WHERE id = ? AND delivered_at IS NULL').run(id)
}

export function settleTeamQueueItem(
  this: OrchestrationDb,
  id: string,
  outcome: { delivered: true } | { delivered: false; reason: string }
): void {
  this.db
    .prepare(
      outcome.delivered
        ? "UPDATE team_member_queue SET delivered_at = datetime('now') WHERE id = ?"
        : 'UPDATE team_member_queue SET failed_reason = ? WHERE id = ?'
    )
    .run(...(outcome.delivered ? [id] : [outcome.reason, id]))
}

export type TeamBoardStoreMethods = {
  assignTeamTaskRefs: typeof assignTeamTaskRefs
  resolveTeamTaskRef: typeof resolveTeamTaskRef
  enqueueTeamMemberMessage: typeof enqueueTeamMemberMessage
  requireTeamQueueItem: typeof requireTeamQueueItem
  listPendingTeamQueue: typeof listPendingTeamQueue
  reorderTeamQueue: typeof reorderTeamQueue
  removeTeamQueueItem: typeof removeTeamQueueItem
  settleTeamQueueItem: typeof settleTeamQueueItem
}

export function attachTeamBoardStore(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    assignTeamTaskRefs,
    resolveTeamTaskRef,
    enqueueTeamMemberMessage,
    requireTeamQueueItem,
    listPendingTeamQueue,
    reorderTeamQueue,
    removeTeamQueueItem,
    settleTeamQueueItem
  })
}
