import React, { useMemo } from 'react'
import { SquareArrowOutUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { parseSqliteUtc } from './team-board-lanes'
import { teamTaskKindLabel, teamTaskStatusLabel } from './team-enum-labels'
import type { TeamGoal, TeamMember, TeamSnapshot, TeamTask } from './team-snapshot-types'
import { teamTaskOwner } from './team-task-owner'

function parseDeps(raw: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function timestamp(value: string | null): string {
  const parsed = parseSqliteUtc(value)
  return parsed === null ? '—' : new Date(parsed).toLocaleString()
}

function goalTitle(goal: TeamGoal | TeamTask | undefined): string {
  if (!goal) {
    return '—'
  }
  return 'title' in goal ? goal.title : (goal.task_title ?? goal.spec.split('\n')[0] ?? '')
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="break-words text-[13px]">{children}</div>
    </div>
  )
}

export function TeamTaskDetailDialog({
  task,
  snapshot,
  onOpenMember,
  onClose
}: {
  task: TeamTask | null
  snapshot: TeamSnapshot
  onOpenMember: (memberId: string) => void
  onClose: () => void
}): React.JSX.Element {
  const deps = useMemo(() => parseDeps(task?.deps), [task?.deps])
  const owner: TeamMember | undefined = task ? teamTaskOwner(task, snapshot.members) : undefined
  const goal = task
    ? (snapshot.goals?.find((entry) => entry.id === task.parent_id) ??
      snapshot.tasks.find((entry) => entry.id === task.parent_id))
    : undefined
  const ref = task?.ref ?? task?.id ?? ''
  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{translate('team.taskDetail.title', 'Task {{ref}}', { ref })}</DialogTitle>
          <DialogDescription>
            {task?.task_title ?? translate('team.taskDetail.untitled', 'Untitled task')}
          </DialogDescription>
        </DialogHeader>
        {task ? (
          <div className="scrollbar-sleek max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label={translate('team.taskDetail.status', 'Status')}>
                {teamTaskStatusLabel(task.status)}
              </Field>
              <Field label={translate('team.taskDetail.kind', 'Kind')}>
                {teamTaskKindLabel(task.kind)}
              </Field>
              <Field label={translate('team.taskDetail.assignee', 'Assignee')}>
                {owner ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="-ml-2"
                    onClick={() => onOpenMember(owner.id)}
                  >
                    <SquareArrowOutUpRight />
                    {owner.display_name}
                  </Button>
                ) : (
                  translate('team.tasks.unassigned', 'Unassigned')
                )}
              </Field>
              <Field label={translate('team.taskDetail.goal', 'Goal')}>{goalTitle(goal)}</Field>
              <Field label={translate('team.taskDetail.created', 'Created')}>
                {timestamp(task.created_at)}
              </Field>
              <Field label={translate('team.taskDetail.completed', 'Completed')}>
                {timestamp(task.completed_at)}
              </Field>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
                {translate('team.taskDetail.spec', 'Spec')}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px]">{task.spec}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
                {translate('team.taskDetail.depends', 'Depends on')}
              </div>
              {deps.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  {translate('team.taskDetail.noDeps', 'No dependencies.')}
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {deps.map((id) => {
                    const dep = snapshot.tasks.find((entry) => entry.id === id)
                    return (
                      <li key={id} className="text-[13px]">
                        <span className="font-mono text-[12px]">{dep?.ref ?? id}</span>
                        {dep?.task_title ? ` · ${dep.task_title}` : ''}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
