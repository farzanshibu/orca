import React from 'react'
import { Plus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import { AgentStateDot } from '@/components/AgentStateDot'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { floorDotState, type FloorActivity } from './office-floor-state'
import { Portrait, memberLook } from './office-floor-sprite'
import type { TeamMember, TeamTask } from './team-snapshot-types'

export type PlacedMember = {
  member: TeamMember
  activity: FloorActivity
  tool: string
  task: TeamTask | undefined
  hasMail: boolean
}

function activityLabel(activity: FloorActivity, paused: boolean): string {
  switch (activity) {
    case 'working':
      return translate('team.floor.status.working', 'Working')
    case 'waiting':
      return translate('team.floor.status.waiting', 'Needs you')
    case 'idle':
      return translate('team.floor.status.idle', 'On a break')
    case 'off':
      return paused
        ? translate('team.floor.status.paused', 'Paused')
        : translate('team.floor.status.off', 'Out of office')
  }
}

/** One line on what the member is doing right now. */
function currentLine({ activity, tool, task }: PlacedMember): string {
  if (activity === 'working' && tool) {
    return task ? `${tool} · ${task.ref ?? task.id}` : tool
  }
  if (task) {
    return `${task.ref ?? task.id} · ${task.task_title ?? task.spec}`
  }
  return activity === 'working'
    ? translate('team.floor.noTask', 'No ticket assigned')
    : translate('team.floor.noActivity', 'Nothing in flight')
}

function RosterCard({
  entry,
  onOpenRoom
}: {
  entry: PlacedMember
  onOpenRoom: (memberId: string) => void
}): React.JSX.Element {
  const { member, activity } = entry
  return (
    <button
      type="button"
      data-activity={activity}
      onClick={() => onOpenRoom(member.id)}
      className="flex w-60 shrink-0 snap-start items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-left shadow-xs transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring data-[activity=off]:opacity-70 data-[activity=waiting]:border-agent-question/50"
    >
      <Portrait look={memberLook(member.slug, Boolean(member.is_manager))} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{member.display_name}</span>
          <AgentIcon agent={isTuiAgent(member.agent) ? member.agent : null} size={12} />
          {member.is_manager ? (
            <span className="rounded-sm bg-muted px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {translate('team.floor.manager', 'Lead')}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <AgentStateDot state={floorDotState(activity, member.liveness)} size="sm" />
          <span className="truncate">
            {activityLabel(activity, Boolean(member.paused_at))} · {member.role_slug}
          </span>
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {currentLine(entry)}
        </div>
      </div>
    </button>
  )
}

export function FloorRoster({
  placed,
  onOpenRoom,
  onAddMember
}: {
  placed: readonly PlacedMember[]
  onOpenRoom: (memberId: string) => void
  onAddMember: () => void
}): React.JSX.Element {
  return (
    <div className="scrollbar-sleek flex shrink-0 snap-x gap-2 overflow-x-auto pb-1">
      {placed.map((entry) => (
        <RosterCard key={entry.member.id} entry={entry} onOpenRoom={onOpenRoom} />
      ))}
      <button
        type="button"
        onClick={onAddMember}
        className="flex w-40 shrink-0 snap-start items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[12px] text-muted-foreground transition-colors outline-none hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-3.5" />
        {translate('team.floor.hire', 'Add member')}
      </button>
    </div>
  )
}
