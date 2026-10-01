import React from 'react'
import { translate } from '@/i18n/i18n'
import { teamTaskKindLabel, teamTaskStatusLabel } from './team-enum-labels'
import type { TeamMember, TeamTask } from './team-snapshot-types'
import { teamTaskOwner } from './team-task-owner'

// Done cards leave the board on their own once they have been done this long.
const DONE_CARD_TTL_MS = 30 * 60_000

type ColumnId = 'todo' | 'doing' | 'blocked' | 'done'

function columnFor(status: string): ColumnId {
  if (status === 'dispatched') {
    return 'doing'
  }
  if (status === 'blocked' || status === 'failed') {
    return 'blocked'
  }
  if (status === 'completed') {
    return 'done'
  }
  return 'todo'
}

/** SQLite `datetime('now')` is UTC without a zone marker. */
export function parseSqliteUtc(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(`${value.replace(' ', 'T')}Z`)
  return Number.isFinite(parsed) ? parsed : null
}

export function visibleTeamTasks(tasks: readonly TeamTask[], now: number): TeamTask[] {
  return tasks.filter((task) => {
    if (task.status !== 'completed') {
      return true
    }
    const completed = parseSqliteUtc(task.completed_at)
    return completed === null || now - completed < DONE_CARD_TTL_MS
  })
}

function columnLabel(column: ColumnId): string {
  switch (column) {
    case 'todo':
      return translate('team.tasks.todo', 'To do')
    case 'doing':
      return translate('team.tasks.doing', 'Doing')
    case 'blocked':
      return translate('team.tasks.blocked', 'Blocked')
    case 'done':
      return translate('team.tasks.done', 'Done')
  }
}

const COLUMNS: ColumnId[] = ['todo', 'doing', 'blocked', 'done']

export function TeamTaskBoard({
  tasks,
  members,
  now
}: {
  tasks: readonly TeamTask[]
  members: readonly TeamMember[]
  now: number
}): React.JSX.Element {
  const visible = visibleTeamTasks(tasks, now)
  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto">
      {COLUMNS.map((column) => {
        const cards = visible.filter((task) => columnFor(task.status) === column)
        return (
          <div
            key={column}
            className="flex min-w-[240px] flex-1 flex-col rounded-xl border border-border/60 bg-muted/30"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {columnLabel(column)}
              </span>
              <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                {cards.length}
              </span>
            </div>
            <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {cards.map((task) => {
                const owner = teamTaskOwner(task, members)
                return (
                  <div
                    key={task.id}
                    className="rounded-md border border-border bg-card p-2.5 shadow-xs"
                  >
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{task.ref ?? task.id}</span>
                      {task.kind && task.kind !== 'task' ? (
                        <span>{teamTaskKindLabel(task.kind)}</span>
                      ) : null}
                      {task.status === 'failed' ? (
                        <span>{teamTaskStatusLabel(task.status)}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 line-clamp-3 text-[13px]">
                      {task.task_title ?? task.spec}
                    </div>
                    <div className="mt-1.5 text-[12px] text-muted-foreground">
                      {owner
                        ? owner.display_name
                        : translate('team.tasks.unassigned', 'Unassigned')}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
