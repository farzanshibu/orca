import { describe, expect, it } from 'vitest'
import { parseSqliteUtc, visibleTeamTasks } from './TeamTaskBoard'
import type { TeamTask } from './team-snapshot-types'

function task(status: string, completedAt: string | null): TeamTask {
  return {
    id: `task_${status}_${completedAt}`,
    ref: null,
    task_title: null,
    spec: 's',
    status,
    assignee_handle: null,
    created_at: '2026-09-28 10:00:00',
    completed_at: completedAt
  }
}

describe('team board projection', () => {
  it('drops done cards 30 minutes after completion', () => {
    const now = parseSqliteUtc('2026-09-28 12:00:00')!
    const tasks = [
      task('dispatched', null),
      task('completed', '2026-09-28 11:45:00'),
      task('completed', '2026-09-28 11:00:00')
    ]
    expect(visibleTeamTasks(tasks, now).map((t) => t.completed_at)).toEqual([
      null,
      '2026-09-28 11:45:00'
    ])
  })
})
