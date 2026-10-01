import type { TeamActivityEvent, TeamActivityPage } from '../../../shared/team-activity-event'
import type { OrchestrationDb } from '../orchestration/db'
import type { TeamActivityRow } from '../orchestration/db/teams/team-activity-store'
import type { TeamRow } from '../orchestration/team-types'

const DEFAULT_PAGE = 200
const MAX_PAGE = 500

type TaskFacts = { ref: string | null; goalId: string | null; isGoal: boolean }

/** Ref and goal for each task the rows name, read once per page. */
function taskFacts(
  db: OrchestrationDb,
  team: TeamRow,
  rows: readonly TeamActivityRow[]
): Map<string, TaskFacts> {
  const meta = new Map(db.listTeamTaskMeta(team.id).map((row) => [row.task_id, row]))
  const facts = new Map<string, TaskFacts>()
  for (const row of rows) {
    if (!row.task_id || facts.has(row.task_id)) {
      continue
    }
    const own = meta.get(row.task_id)
    const isGoal = own?.kind === 'goal'
    const parentId = isGoal ? null : (db.getTask(row.task_id)?.parent_id ?? null)
    facts.set(row.task_id, {
      ref: own ? `${team.task_prefix}-${own.number}` : null,
      goalId: isGoal
        ? row.task_id
        : parentId && meta.get(parentId)?.kind === 'goal'
          ? parentId
          : null,
      isGoal
    })
  }
  return facts
}

// A goal is stored as a task; the feed names what happened to it as a goal.
function eventKind(row: TeamActivityRow, facts: TaskFacts | undefined): string {
  if (facts?.isGoal && row.kind === 'task_created') {
    return 'goal_created'
  }
  if (facts?.isGoal && row.kind === 'task_settled') {
    return 'goal_closed'
  }
  return row.kind
}

/**
 * One row per recipient is how a group send is stored: the same thread, sender, and content, each
 * to a different member. A second message to the same member is a new message, however alike.
 */
function continuesGroupSend(previous: TeamActivityRow, row: TeamActivityRow): boolean {
  return (
    row.kind === 'message' &&
    previous.kind === 'message' &&
    row.thread_id !== null &&
    row.thread_id === previous.thread_id &&
    row.from_party === previous.from_party &&
    row.from_member_id === previous.from_member_id &&
    row.message_type === previous.message_type &&
    row.subject === previous.subject &&
    row.detail === previous.detail &&
    row.to_member_id !== null &&
    row.to_member_id !== previous.to_member_id
  )
}

const GROUP_TAIL_BATCH = 50

/** The rows after a full page that finish its last group send, so the limit never cuts one in two. */
function restOfGroupSend(
  db: OrchestrationDb,
  teamId: string,
  rows: readonly TeamActivityRow[]
): TeamActivityRow[] {
  const rest: TeamActivityRow[] = []
  let previous = rows.at(-1)
  while (previous) {
    const batch = db.listTeamActivity(teamId, {
      afterSequence: previous.sequence,
      limit: GROUP_TAIL_BATCH
    })
    let taken = 0
    for (const row of batch) {
      if (!continuesGroupSend(previous, row)) {
        break
      }
      rest.push(row)
      previous = row
      taken += 1
    }
    if (taken < GROUP_TAIL_BATCH) {
      break
    }
  }
  return rest
}

export function projectTeamActivity(
  db: OrchestrationDb,
  team: TeamRow,
  rows: readonly TeamActivityRow[]
): TeamActivityEvent[] {
  const facts = taskFacts(db, team, rows)
  const events: TeamActivityEvent[] = []
  let previous: TeamActivityRow | undefined
  for (const row of rows) {
    const last = events.at(-1)
    if (
      last &&
      previous &&
      row.to_member_id &&
      continuesGroupSend(previous, row) &&
      !last.to.member_ids.includes(row.to_member_id)
    ) {
      last.sequence = row.sequence
      last.to.member_ids.push(row.to_member_id)
      previous = row
      continue
    }
    const task = row.task_id ? facts.get(row.task_id) : undefined
    events.push({
      sequence: row.sequence,
      id: `act_${row.sequence}`,
      kind: eventKind(row, task),
      channel: row.channel,
      status: row.status,
      message_type: row.message_type,
      message_id: row.message_id,
      task_id: row.task_id,
      task_ref: task?.ref ?? null,
      goal_id: task?.goalId ?? null,
      dispatch_id: row.dispatch_id,
      thread_id: row.thread_id,
      from: { party: row.from_party, member_id: row.from_member_id },
      to: { party: row.to_party, member_ids: row.to_member_id ? [row.to_member_id] : [] },
      subject: row.subject,
      body_preview: row.detail,
      created_at: row.created_at
    })
    previous = row
  }
  return events
}

/** A page of the team's feed after `afterSequence`, or its newest events when there is no cursor. */
export function readTeamActivityPage(
  db: OrchestrationDb,
  team: TeamRow,
  request: { afterSequence?: number; limit?: number }
): TeamActivityPage {
  const limit = Math.max(1, Math.min(Math.trunc(request.limit ?? DEFAULT_PAGE), MAX_PAGE))
  const latest = db.getLatestTeamActivitySequence(team.id)
  // A cursor from before the last prune would skip what was dropped without saying so, and one
  // past the newest row (another host, or a recreated database) would wait on rows that never come.
  const reset =
    request.afterSequence !== undefined &&
    (request.afterSequence < team.activity_pruned_through || request.afterSequence > latest)
  const afterSequence = reset ? undefined : request.afterSequence
  const page = db.listTeamActivity(team.id, { afterSequence, limit })
  const rows = page.length < limit ? page : [...page, ...restOfGroupSend(db, team.id, page)]
  const lastRead = rows.at(-1)?.sequence ?? afterSequence ?? latest
  return {
    events: projectTeamActivity(db, team, rows),
    latestSequence: lastRead,
    hasMore: lastRead < latest,
    reset
  }
}
