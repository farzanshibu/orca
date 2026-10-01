import React from 'react'
import { Pause, Play, Power, PowerOff, SquareArrowOutUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentIcon } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { teamAgentLabel } from './team-agent-label'
import { teamMemberAwaitsPermission } from './team-attention'
import { teamMemberLivenessLabel, teamPauseReasonLabel } from './team-enum-labels'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamMemberAction } from './team-runtime-client'
import { formatUsd, type TeamMember, type TeamTask } from './team-snapshot-types'

/** What the member is doing right now, in words. */
export function describeTeamMemberActivity(member: TeamMember, task: TeamTask | undefined): string {
  if (member.paused_at) {
    return teamPauseReasonLabel(member.pause_reason)
  }
  const liveness = teamMemberLiveness(member)
  if (liveness === 'stopped') {
    return teamMemberLivenessLabel(liveness)
  }
  if (liveness === 'unverifiable') {
    return translate('team.activity.unverifiable', 'Terminal not found; it may still be running')
  }
  if (member.agent_status === 'working' && task) {
    return translate('team.activity.workingOn', 'Working on {{ref}}: {{title}}', {
      ref: task.ref ?? task.id,
      title: task.task_title ?? task.spec.slice(0, 80)
    })
  }
  if (member.agent_status === 'working') {
    return translate('team.activity.working', 'Working')
  }
  if (teamMemberAwaitsPermission(member)) {
    return translate('team.activity.permission', 'Waiting for a permission prompt')
  }
  return translate('team.activity.idle', 'Idle, waiting for work')
}

export function TeamAgentCard({
  member,
  task,
  busy,
  onOpenRoom,
  onAction
}: {
  member: TeamMember
  task: TeamTask | undefined
  busy: boolean
  onOpenRoom: (memberId: string) => void
  onAction: (member: TeamMember, action: TeamMemberAction) => void
}): React.JSX.Element {
  const liveness = teamMemberLiveness(member)
  // Unverifiable offers Stop, not Start: the member may still be running.
  const running = liveness !== 'stopped'
  return (
    <div
      data-current={member.agent_status === 'working' ? 'true' : undefined}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
          <AgentIcon agent={isTuiAgent(member.agent) ? member.agent : null} size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold">{member.display_name}</span>
            {member.is_manager ? (
              <Badge variant="secondary">{translate('team.badge.manager', 'Manager')}</Badge>
            ) : null}
          </div>
          <div className="truncate text-[12px] text-muted-foreground">
            {member.role_slug} · {teamAgentLabel(member.agent)}
            {member.model ? ` · ${member.model}` : ''}
          </div>
        </div>
        <Badge variant="outline">{teamMemberLivenessLabel(liveness)}</Badge>
      </div>
      <p className="line-clamp-2 min-h-[2lh] text-[13px]">
        {describeTeamMemberActivity(member, task)}
      </p>
      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        <span>
          {translate('team.card.spend', 'Spend')}{' '}
          <span className="font-mono text-foreground">{formatUsd(member.spend_usd)}</span>
          {member.spend_cap_usd !== null ? ` / ${formatUsd(member.spend_cap_usd)}` : ''}
        </span>
        {member.spend_tokens !== null ? (
          <span>
            {translate('team.card.tokens', '{{tokens}} tokens', {
              tokens: member.spend_tokens.toLocaleString()
            })}
          </span>
        ) : null}
        {member.queue.length > 0 ? (
          <span>
            {translate('team.card.queued', '{{count}} queued', { count: member.queue.length })}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onOpenRoom(member.id)}>
          <SquareArrowOutUpRight />
          {translate('team.card.openRoom', 'Open room')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onAction(member, running ? 'Stop' : 'Start')}
        >
          {running ? <PowerOff /> : <Power />}
          {running ? translate('team.card.stop', 'Stop') : translate('team.card.start', 'Start')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onAction(member, member.paused_at ? 'Resume' : 'Pause')}
        >
          {member.paused_at ? <Play /> : <Pause />}
          {member.paused_at
            ? translate('team.card.resume', 'Resume')
            : translate('team.card.pause', 'Pause')}
        </Button>
      </div>
    </div>
  )
}
