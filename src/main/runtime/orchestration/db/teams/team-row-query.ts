import type { z } from 'zod'
import type Database from '../../../../sqlite/sync-database'

type SqlArg = string | number | null

/** One row checked against its schema; a row that fails it means a corrupt database, so it throws. */
export function queryTeamRow<T>(
  db: Database.Database,
  schema: z.ZodType<T>,
  sql: string,
  ...args: SqlArg[]
): T | undefined {
  const row: unknown = db.prepare(sql).get(...args)
  return row === undefined ? undefined : schema.parse(row)
}

export function queryTeamRows<T>(
  db: Database.Database,
  schema: z.ZodType<T>,
  sql: string,
  ...args: SqlArg[]
): T[] {
  const rows: unknown[] = db.prepare(sql).all(...args)
  return rows.map((row) => schema.parse(row))
}
