import React from 'react'
import { Mail } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import { AgentQuestionIcon } from '@/components/AgentQuestionIcon'
import { AgentStateDot } from '@/components/AgentStateDot'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { floorDotState, memberInitials, type FloorActivity } from './office-floor-state'
import type { TeamMember, TeamTask } from './team-snapshot-types'

export type PlacedMember = {
  member: TeamMember
  activity: FloorActivity
  tool: string
  task: TeamTask | undefined
  hasMail: boolean
}

export function MemberAvatar({
  member,
  size = 'md'
}: {
  member: TeamMember
  size?: 'sm' | 'md'
}): React.JSX.Element {
  return (
    <span
      data-size={size}
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[12px] font-semibold text-foreground data-[size=sm]:size-8 data-[size=sm]:text-[11px]"
    >
      {memberInitials(member.display_name)}
      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border border-border bg-card">
        <AgentIcon agent={isTuiAgent(member.agent) ? member.agent : null} size={10} />
      </span>
    </span>
  )
}

/** The desk's monitor: what the member is doing right now, at a glance. */
function DeskScreen({ entry }: { entry: PlacedMember }): React.JSX.Element {
  const { activity, member, tool, task } = entry
  let body: React.ReactNode
  if (activity === 'working') {
    body = (
      <>
        <span className="truncate text-foreground">
          {tool ? `▸ ${tool}` : translate('team.floor.screen.working', '▸ working')}
        </span>
        <span className="truncate text-muted-foreground">
          {task
            ? `${task.ref ?? task.id} · ${task.task_title ?? task.spec}`
            : translate('team.floor.screen.noTask', 'no ticket assigned')}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-foreground/30" />
      </>
    )
  } else if (activity === 'waiting') {
    body = (
      <span className="flex items-center gap-1.5 text-agent-question">
        <AgentQuestionIcon className="size-3.5" />
        {translate('team.floor.screen.waiting', 'Needs your answer')}
      </span>
    )
  } else if (activity === 'idle') {
    body = (
      <span className="text-muted-foreground">
        {translate('team.floor.screen.away', 'Away from desk')}
      </span>
    )
  } else {
    body = (
      <span className="text-muted-foreground">
        {member.paused_at
          ? translate('team.floor.screen.paused', 'Paused')
          : translate('team.floor.screen.off', 'Screen off')}
      </span>
    )
  }
  return (
    <div
      data-activity={activity}
      className="relative flex h-12 flex-col justify-center gap-0.5 overflow-hidden rounded-md border border-border bg-muted/40 px-2.5 font-mono text-[11px] data-[activity=off]:bg-muted/20 data-[activity=waiting]:border-agent-question/40"
    >
      {body}
    </div>
  )
}

export function Desk({
  entry,
  onOpenRoom
}: {
  entry: PlacedMember
  onOpenRoom: (memberId: string) => void
}): React.JSX.Element {
  const { member, activity, hasMail } = entry
  return (
    <button
      type="button"
      data-activity={activity}
      onClick={() => onOpenRoom(member.id)}
      className="relative flex w-full flex-col gap-2.5 rounded-lg border border-border bg-card p-2.5 text-left shadow-xs transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring data-[activity=off]:opacity-60 data-[activity=waiting]:border-agent-question/50"
    >
      <div className="flex gap-2">
        <span
          data-floor-anchor={`desk-${member.id}`}
          className="h-12 w-9 shrink-0 rounded-md border border-dashed border-border"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <DeskScreen entry={entry} />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <MemberAvatar member={member} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{member.display_name}</div>
          <div className="truncate text-[11px] text-muted-foreground">{member.role_slug}</div>
        </div>
        {hasMail ? (
          <Mail
            className="size-3.5 animate-bounce text-muted-foreground"
            aria-label={translate('team.floor.mail', 'New message')}
          />
        ) : null}
        <AgentStateDot state={floorDotState(activity, member.liveness)} size="md" />
      </div>
    </button>
  )
}
