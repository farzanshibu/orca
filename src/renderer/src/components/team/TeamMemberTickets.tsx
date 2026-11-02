import React from 'react'
import { ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { teamTaskStatusLabel } from './team-enum-labels'
import type { TeamMember, TeamTask } from './team-snapshot-types'
import { teamMemberOwnedTasks, teamTaskSettled } from './team-task-owner'

function statusTone(status: string): 'ok' | 'warn' | 'danger' | 'info' | 'accent' | undefined {
  switch (status) {
    case 'completed':
      return 'ok'
    case 'failed':
      return 'danger'
    case 'blocked':
      return 'warn'
    case 'dispatched':
      return 'info'
    case 'ready':
      return 'accent'
    default:
      return undefined
  }
}

/** Every ticket an agent has held, newest open first; clicking one opens its detail. */
export function TeamMemberTickets({
  member,
  members,
  tasks,
  onOpenTask
}: {
  member: TeamMember
  members: readonly TeamMember[]
  tasks: readonly TeamTask[]
  onOpenTask: (task: TeamTask) => void
}): React.JSX.Element {
  const owned = teamMemberOwnedTasks(member, tasks, members)
  const open = owned.filter((task) => !teamTaskSettled(task))
  const ordered = [...open, ...owned.filter((task) => teamTaskSettled(task))]
  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="bureau-display text-bureau-ink-soft">
          {translate('team.sheet.tickets', 'Tickets')} · {owned.length}
        </span>
        {open.length > 0 ? (
          <span className="bureau-chip" data-tone="info">
            {translate('team.sheet.queued', '{{count}} queued', { count: open.length })}
          </span>
        ) : null}
      </div>
      {owned.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {translate('team.sheet.noTickets', 'No ticket has been assigned to this agent.')}
        </p>
      ) : (
        <div className="scrollbar-sleek flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {ordered.slice(0, 12).map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask(task)}
              data-settled={teamTaskSettled(task) ? 'true' : undefined}
              className="bureau-card flex w-full items-center gap-2 p-2 text-left data-[settled=true]:opacity-60"
            >
              <span className="shrink-0 font-mono text-[11px] text-bureau-ink-soft">
                {task.ref ?? task.id}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">
                  {task.task_title ?? task.spec.split('\n')[0]}
                </span>
                {task.task_title ? (
                  <span className="block truncate text-[11px] text-bureau-ink-soft">
                    {task.spec.split('\n')[0]}
                  </span>
                ) : null}
              </span>
              <span className="bureau-chip" data-tone={statusTone(task.status)}>
                {teamTaskStatusLabel(task.status)}
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-bureau-ink-soft" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
