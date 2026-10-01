import type { OrchestrationDb } from '../orchestration-db'

const V44_COLUMNS = [
  ['teams', 'max_parallel', 'INTEGER'],
  ['teams', 'activity_pruned_through', 'INTEGER NOT NULL DEFAULT 0'],
  ['team_task_refs', 'kind', "TEXT NOT NULL DEFAULT 'task' CHECK(kind IN ('task', 'goal'))"],
  ['team_task_refs', 'assignee_member_id', 'TEXT'],
  ['team_task_refs', 'assigned_at', 'TEXT'],
  ['team_task_refs', 'review_requested_at', 'TEXT'],
  ['team_member_queue', 'source', "TEXT NOT NULL DEFAULT 'operator'"]
] as const

/**
 * Team fan-out: task assignment and goals, the queue's source, and the activity feed (created with
 * the other team tables). Indexes on the new columns live here, not in the table SQL, because
 * createTables runs before this on a v43 database whose tables still lack the columns.
 */
export function migrateV44(this: OrchestrationDb, current: number): void {
  if (current >= 44) {
    return
  }
  // Guarded because createTables already gives a fresh database these.
  for (const [table, column, type] of V44_COLUMNS) {
    if (!this.hasColumn(table, column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    }
  }
  this.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_team_task_refs_assignee
      ON team_task_refs(assignee_member_id) WHERE assignee_member_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_team_members_pane_leaf
      ON team_members(substr(pane_key, instr(pane_key, ':') + 1)) WHERE pane_key IS NOT NULL;
  `)
}
