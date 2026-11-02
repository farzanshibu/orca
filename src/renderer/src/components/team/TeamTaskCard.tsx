import React from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { TeamAssignNote } from './team-assign-outcome'
import { teamTaskStatusLabel } from './team-enum-labels'
import type { TeamMember, TeamTask } from './team-snapshot-types'

function OwnerMenu({
  task,
  ownerName,
  assignees,
  busy,
  onAssign
}: {
  task: TeamTask
  ownerName: string
  assignees: readonly TeamMember[]
  busy: boolean
  onAssign: (task: TeamTask, memberId: string | null) => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" disabled={busy} className="-ml-2 max-w-full">
          <span className="truncate">{ownerName}</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{translate('team.assign.menuLabel', 'Assign to')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={task.assignee_member_id ?? ''}
          onValueChange={(memberId) => onAssign(task, memberId)}
        >
          {assignees.map((member) => (
            <DropdownMenuRadioItem key={member.id} value={member.id}>
              {member.display_name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {task.assignee_member_id ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAssign(task, null)}>
              {translate('team.assign.unassign', 'Unassign')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TeamTaskCard({
  task,
  owner,
  assignees,
  busy,
  note,
  onAssign,
  onOpen
}: {
  task: TeamTask
  owner: TeamMember | undefined
  /** Who the task can go to; empty where this card offers no assignment. */
  assignees: readonly TeamMember[]
  busy: boolean
  /** Why the task has not started, or what the last assignment did. */
  note: TeamAssignNote | null
  onAssign: (task: TeamTask, memberId: string | null) => void
  onOpen?: (task: TeamTask) => void
}): React.JSX.Element {
  const ownerName = owner?.display_name ?? translate('team.tasks.unassigned', 'Unassigned')
  const headline = task.task_title ?? task.spec
  return (
    <div className="rounded-md border border-border bg-card p-2.5 shadow-xs">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{task.ref ?? task.id}</span>
        <span className="bureau-chip">{teamTaskStatusLabel(task.status)}</span>
      </div>
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="mt-1 line-clamp-3 text-left text-[13px] hover:underline"
        >
          {headline}
        </button>
      ) : (
        <div className="mt-1 line-clamp-3 text-[13px]">{headline}</div>
      )}
      <div className="mt-1.5 text-[12px] text-muted-foreground">
        {assignees.length > 0 ? (
          <OwnerMenu
            task={task}
            ownerName={ownerName}
            assignees={assignees}
            busy={busy}
            onAssign={onAssign}
          />
        ) : (
          ownerName
        )}
      </div>
      {note ? (
        <div
          role={note.tone === 'error' ? 'alert' : undefined}
          className={
            note.tone === 'error'
              ? 'mt-1 text-[12px] break-words text-destructive'
              : 'mt-1 text-[12px] break-words text-muted-foreground'
          }
        >
          {note.text}
        </div>
      ) : null}
    </div>
  )
}
