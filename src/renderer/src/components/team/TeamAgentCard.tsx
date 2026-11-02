import React from 'react'
import {
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Power,
  PowerOff,
  SquareArrowOutUpRight,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { teamAgentLabel } from './team-agent-label'
import { teamMemberAwaitsPermission } from './team-attention'
import { teamPauseReasonLabel } from './team-enum-labels'
import { teamMemberLiveness } from './team-member-liveness'
import { TeamMemberStatusChip, teamMemberStatus } from './team-member-status'
import type { TeamMemberAction } from './team-runtime-client'
import { formatUsd, type TeamMember, type TeamTask } from './team-snapshot-types'
import { Portrait, memberLook } from './office-floor-sprite'

/** What the member is doing right now, in words. */
export function describeTeamMemberActivity(member: TeamMember, task: TeamTask | undefined): string {
  if (member.paused_at) {
    return teamPauseReasonLabel(member.pause_reason)
  }
  const liveness = teamMemberLiveness(member)
  if (liveness === 'stopped') {
    return translate('team.activity.stopped', 'Out of office, waiting to start')
  }
  if (liveness === 'unverifiable') {
    return translate('team.activity.unverifiable', 'Terminal not found; it may still be running')
  }
  if (member.waiting_reason) {
    return translate('team.activity.waiting', 'Waiting: {{reason}}', {
      reason: member.waiting_reason
    })
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

function cardGauge(member: TeamMember): { percent: number; label: string } {
  const spend = member.spend_usd
  const tokens = member.spend_tokens
  if (member.token_cap && tokens !== null) {
    return {
      percent: Math.min(100, (tokens / member.token_cap) * 100),
      label: translate('team.card.tokenCap', '{{tokens}} / {{cap}} tokens', {
        tokens: tokens.toLocaleString(),
        cap: member.token_cap.toLocaleString()
      })
    }
  }
  if (member.spend_cap_usd && spend !== null) {
    return {
      percent: Math.min(100, (spend / member.spend_cap_usd) * 100),
      label: translate('team.card.spendCap', '{{spend}} / {{cap}}', {
        spend: formatUsd(spend),
        cap: formatUsd(member.spend_cap_usd)
      })
    }
  }
  return {
    percent: 0,
    label: translate('team.card.tokens', '{{tokens}} tokens', {
      tokens: (tokens ?? 0).toLocaleString()
    })
  }
}

export function TeamAgentCard({
  member,
  task,
  tickets,
  needsYou,
  snippet,
  busy,
  onOpenRoom,
  onAction,
  onEdit,
  onRemove
}: {
  member: TeamMember
  task: TeamTask | undefined
  /** Open tickets under this agent, shown as refs on the card. */
  tickets: readonly TeamTask[]
  needsYou: boolean
  /** The newest mail to or from this agent, for the card's terminal-style preview. */
  snippet: string | null
  busy: boolean
  onOpenRoom: (memberId: string) => void
  onAction: (member: TeamMember, action: TeamMemberAction) => void
  onEdit: (member: TeamMember) => void
  onRemove: (member: TeamMember) => void
}): React.JSX.Element {
  const liveness = teamMemberLiveness(member)
  // Unverifiable offers Stop, not Start: the member may still be running.
  const running = liveness !== 'stopped'
  const status = teamMemberStatus(member, needsYou)
  const gauge = cardGauge(member)
  return (
    <div
      data-current={member.agent_status === 'working' ? 'true' : undefined}
      className="bureau-card flex flex-col gap-2 p-3"
    >
      <div className="flex items-start gap-2">
        <Portrait look={memberLook(member.slug, Boolean(member.is_manager))} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold">{member.display_name}</span>
            {member.is_manager ? (
              <span className="bureau-chip" data-tone="accent">
                {translate('team.monitor.lead', 'Lead')}
              </span>
            ) : null}
            <TeamMemberStatusChip status={status} />
          </div>
          <div className="flex items-center gap-1 truncate text-[11px] text-bureau-ink-soft">
            <AgentIcon agent={isTuiAgent(member.agent) ? member.agent : null} size={12} />
            <span className="truncate">
              {member.role_slug} · {teamAgentLabel(member.agent)}
              {member.model ? ` · ${member.model}` : ''}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={busy}
              aria-label={translate('team.card.moreActions', 'More actions for {{name}}', {
                name: member.display_name
              })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(member)}>
              <Pencil />
              {translate('team.card.edit', 'Edit member')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onRemove(member)}>
              <Trash2 />
              {translate('team.card.remove', 'Remove member')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="line-clamp-2 min-h-[2lh] text-[12px]">
        {describeTeamMemberActivity(member, task)}
      </p>
      {snippet ? <div className="bureau-code line-clamp-2">{snippet}</div> : null}
      <div className="flex flex-wrap gap-1">
        {tickets.slice(0, 3).map((ticket) => (
          <span key={ticket.id} className="bureau-chip" data-tone="info">
            {ticket.ref ?? ticket.id}
          </span>
        ))}
        {tickets.length > 3 ? <span className="bureau-chip">+{tickets.length - 3}</span> : null}
        {member.queue.length > 0 ? (
          <span className="bureau-chip" data-tone="warn">
            {translate('team.card.queued', '{{count}} queued', { count: member.queue.length })}
          </span>
        ) : null}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-[11px] text-bureau-ink-soft">
          <span className="truncate">{gauge.label}</span>
          <span className="font-mono">{formatUsd(member.spend_usd)}</span>
        </div>
        <div
          className="bureau-gauge"
          data-tone={gauge.percent >= 100 ? 'danger' : gauge.percent >= 80 ? 'warn' : 'ok'}
        >
          <span style={{ width: `${gauge.percent}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="xs" variant="secondary" onClick={() => onOpenRoom(member.id)}>
          <SquareArrowOutUpRight />
          {translate('team.card.openAgent', 'Open agent')}
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={busy}
          aria-label={
            running ? translate('team.card.stop', 'Stop') : translate('team.card.start', 'Start')
          }
          onClick={() => onAction(member, running ? 'Stop' : 'Start')}
        >
          {running ? <PowerOff /> : <Power />}
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={busy}
          aria-label={
            member.paused_at
              ? translate('team.card.resume', 'Resume')
              : translate('team.card.pause', 'Pause')
          }
          onClick={() => onAction(member, member.paused_at ? 'Resume' : 'Pause')}
        >
          {member.paused_at ? <Play /> : <Pause />}
        </Button>
      </div>
    </div>
  )
}
