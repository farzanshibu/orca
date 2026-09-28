import type { OrchestrationDb } from '../orchestration-db'
import { TEAM_TABLES_SQL } from './create-team-tables-sql'

/** Standing teams: a per-repo roster of named role agents that share one orchestration Run. */
export function migrateV43(this: OrchestrationDb, current: number): void {
  if (current >= 43) {
    return
  }
  this.db.exec(TEAM_TABLES_SQL)
}
