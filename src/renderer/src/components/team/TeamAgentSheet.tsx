import React from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { describeTeamMemberActivity } from './TeamAgentCard'
import { TeamMemberMonitor } from './TeamMemberMonitor'
import type { TeamMemberAction } from './team-runtime-client'
import type { TeamLogMessage, TeamMember, TeamTask } from './team-snapshot-types'
import { teamMemberCurrentTask } from './team-task-owner'
import type { TeamActivity } from './use-team-activity'
import type { TeamAct } from './use-team-page-state'

/** The agent's whole life — terminal, tickets, mail, queue and grants — in one side sheet. */
export function TeamAgentSheet({
  open,
  onOpenChange,
  target,
  teamId,
  member,
  members,
  tasks,
  activity,
  log,
  busy,
  act,
  onAction,
  onEdit,
  onRemove,
  onOpenTask
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: RuntimeClientTarget
  teamId: string
  member: TeamMember | null
  members: readonly TeamMember[]
  tasks: readonly TeamTask[]
  activity: TeamActivity
  log: readonly TeamLogMessage[]
  busy: boolean
  act: TeamAct
  onAction: (member: TeamMember, action: TeamMemberAction) => void
  onEdit: (member: TeamMember) => void
  onRemove: (member: TeamMember) => void
  onOpenTask: (task: TeamTask) => void
}): React.JSX.Element {
  const task = member ? teamMemberCurrentTask(member, tasks) : undefined
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[680px]">
        {member ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>{member.display_name}</SheetTitle>
              <SheetDescription>{describeTeamMemberActivity(member, task)}</SheetDescription>
            </SheetHeader>
            {/* Leaves the sheet's close button its own corner above the portrait. */}
            <div className="flex min-h-0 flex-1 flex-col pt-8">
              <TeamMemberMonitor
                key={member.id}
                target={target}
                teamId={teamId}
                member={member}
                members={members}
                tasks={tasks}
                activity={activity}
                log={log}
                busy={busy}
                act={act}
                onAction={onAction}
                onEdit={onEdit}
                onRemove={onRemove}
                onOpenTask={onOpenTask}
              />
            </div>
          </>
        ) : (
          <p className="p-4 text-[13px] text-muted-foreground">
            {translate('team.sheet.noMember', 'This agent is no longer on the floor.')}
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}
