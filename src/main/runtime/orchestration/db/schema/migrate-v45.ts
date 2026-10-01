import type { OrchestrationDb } from '../orchestration-db'

const V45_COLUMNS = [
  ['team_task_refs', 'start_failures', 'INTEGER NOT NULL DEFAULT 0'],
  ['team_task_refs', 'retry_at', 'TEXT'],
  ['team_task_refs', 'escalated_at', 'TEXT'],
  ['team_task_refs', 'counted_dispatch_id', 'TEXT']
] as const

/**
 * Goal fan-out: what the team scheduler remembers about starting an assigned task, so a restart
 * neither forgets a backoff nor escalates twice. The goal index lives here, not in the table SQL,
 * because createTables runs before v44 on a v43 database whose table still lacks `kind`.
 */
export function migrateV45(this: OrchestrationDb, current: number): void {
  if (current >= 45) {
    return
  }
  // Guarded because createTables already gives a fresh database these.
  for (const [table, column, type] of V45_COLUMNS) {
    if (!this.hasColumn(table, column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    }
  }
  this.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_team_task_refs_goal
      ON team_task_refs(team_id) WHERE kind = 'goal';
  `)
}
