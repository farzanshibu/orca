import React, { useMemo, useRef, useState } from 'react'
import { ListPlus, Pause, Pencil, Play, Power, PowerOff, Send, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { AgentTerminalPreview } from '../dashboard-popout/AgentTerminalPreview'
import { AgentIcon } from '@/lib/agent-catalog'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { describeTeamMemberActivity } from './TeamAgentCard'
import { TeamCapabilitiesEditor } from './TeamCapabilitiesEditor'
import { DictateButton } from './TeamVoicePanel'
import { TeamActivityList } from './team-activity-list'
import { teamAgentLabel } from './team-agent-label'
import { buildTeamFeedRows, teamMailRows } from './team-feed-threads'
import { teamMemberLiveness } from './team-member-liveness'
import { TeamMemberStatusChip, teamMemberStatus } from './team-member-status'
import { TeamMemberQueue } from './TeamMemberQueue'
import { TeamMemberTickets } from './TeamMemberTickets'
import { queueTeamMessage, sendToTeamMember, type TeamMemberAction } from './team-runtime-client'
import {
  formatUsd,
  type TeamLogMessage,
  type TeamMember,
  type TeamTask
} from './team-snapshot-types'
import { teamMemberCurrentTask } from './team-task-owner'
import type { TeamActivity } from './use-team-activity'
import { useMemberPtyId } from './use-member-pty-id'
import type { TeamAct } from './use-team-page-state'
import { Portrait, memberLook } from './office-floor-sprite'

function MonitorHeader({
  member,
  task,
  onEdit,
  onRemove
}: {
  member: TeamMember
  task: TeamTask | undefined
  onEdit: (member: TeamMember) => void
  onRemove: (member: TeamMember) => void
}): React.JSX.Element {
  const memberStatus = teamMemberStatus(member)
  return (
    <div className="flex flex-wrap items-start gap-3 border-b-2 border-bureau-ink pb-3">
      <Portrait look={memberLook(member.slug, Boolean(member.is_manager))} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{member.display_name}</span>
          {member.is_manager ? (
            <span className="bureau-chip">{translate('team.monitor.lead', 'Lead')}</span>
          ) : null}
          <TeamMemberStatusChip status={memberStatus} />
        </div>
        <div className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
          <AgentIcon agent={isTuiAgent(member.agent) ? member.agent : null} size={12} />
          <span className="truncate">
            {member.role_slug} · {teamAgentLabel(member.agent)}
            {member.model ? ` · ${member.model}` : ''}
          </span>
        </div>
        <p className="mt-1 text-[13px]">{describeTeamMemberActivity(member, task)}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={translate('team.card.edit', 'Edit member')}
          onClick={() => onEdit(member)}
        >
          <Pencil />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={translate('team.card.remove', 'Remove member')}
          onClick={() => onRemove(member)}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function MonitorActions({
  member,
  busy,
  onAction
}: {
  member: TeamMember
  busy: boolean
  onAction: (member: TeamMember, action: TeamMemberAction) => void
}): React.JSX.Element {
  const running = teamMemberLiveness(member) !== 'stopped'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        variant="secondary"
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
      <span className="ml-auto text-[12px] text-muted-foreground">
        {member.spend_tokens !== null ? (
          <>
            {translate('team.card.tokens', '{{tokens}} tokens', {
              tokens: member.spend_tokens.toLocaleString()
            })}
            {' · '}
          </>
        ) : null}
        {translate('team.card.spend', 'Spend')}{' '}
        <span className="font-mono text-foreground">{formatUsd(member.spend_usd)}</span>
        {member.spend_cap_usd !== null ? ` / ${formatUsd(member.spend_cap_usd)}` : ''}
      </span>
    </div>
  )
}

function ContextGauge({ member }: { member: TeamMember }): React.JSX.Element {
  const tokens = member.spend_tokens
  const cap = member.token_cap
  const percent = tokens !== null && cap ? Math.min(100, (tokens / cap) * 100) : 0
  return (
    <section className="bureau-card space-y-1 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="bureau-display text-bureau-ink-soft">
          {translate('team.monitor.context', 'Context')}
        </span>
        <span className="text-[11px] tabular-nums text-bureau-ink-soft">
          {tokens !== null
            ? translate('team.monitor.tokensOfCap', '{{tokens}} tokens', {
                tokens: tokens.toLocaleString()
              })
            : translate('team.monitor.noTokens', 'No tokens spent yet')}
          {tokens !== null && cap !== null ? ` / ${cap.toLocaleString()}` : ''}
        </span>
      </div>
      {cap !== null ? (
        <div
          className="bureau-gauge"
          data-tone={percent >= 100 ? 'danger' : percent >= 80 ? 'warn' : 'ok'}
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={translate('team.monitor.contextGauge', 'Tokens against the member cap')}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <div className="text-[11px] text-bureau-ink-soft">
        {translate('team.card.spend', 'Spend')} {formatUsd(member.spend_usd)}
        {member.spend_cap_usd !== null ? ` / ${formatUsd(member.spend_cap_usd)}` : ''}
      </div>
    </section>
  )
}

export function TeamMemberMonitor({
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
  target: RuntimeClientTarget
  teamId: string
  member: TeamMember
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
  const [draft, setDraft] = useState('')
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
  const ptyId = useMemberPtyId(target, member.live_handle)
  const task = teamMemberCurrentTask(member, tasks)
  const conversation = useMemo(
    () =>
      teamMailRows(buildTeamFeedRows(activity.entries), { kind: 'member', memberId: member.id }),
    [activity.entries, member.id]
  )
  const fullBodies = useMemo(() => new Map(log.map((message) => [message.id, message.body])), [log])

  async function submit(mode: 'now' | 'interrupt' | 'queue'): Promise<void> {
    if (!draft.trim()) {
      return
    }
    const ok = await act(() =>
      mode === 'queue'
        ? queueTeamMessage(target, { team: teamId, member: member.id, text: draft })
        : sendToTeamMember(target, {
            team: teamId,
            member: member.id,
            text: draft,
            interrupt: mode === 'interrupt'
          })
    )
    if (ok) {
      setDraft('')
    }
  }

  return (
    <div className="@container/team-room scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <MonitorHeader member={member} task={task} onEdit={onEdit} onRemove={onRemove} />
      <MonitorActions member={member} busy={busy} onAction={onAction} />
      {member.role_brief ? (
        <p className="line-clamp-2 text-[12px] text-muted-foreground">{member.role_brief}</p>
      ) : null}
      <div className="grid gap-3 @3xl/team-room:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <TeamMemberTickets
          member={member}
          members={members}
          tasks={tasks}
          onOpenTask={onOpenTask}
        />
        <div className="flex flex-col gap-2">
          <ContextGauge member={member} />
          <div className="flex h-64 min-h-0 shrink-0 flex-col overflow-hidden rounded-md border-2 border-bureau-ink bg-background">
            {ptyId ? (
              <AgentTerminalPreview ptyId={ptyId} className="h-full w-full" />
            ) : (
              <p className="p-3 text-[13px] text-muted-foreground">
                {translate('team.room.noTerminal', 'Start this member to see its live terminal.')}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-3 @3xl/team-room:grid-cols-2">
        <div className="flex h-64 min-h-0 flex-col rounded-md border border-border p-1">
          <TeamActivityList
            key={member.id}
            rows={conversation}
            members={members}
            fullBodies={fullBodies}
            bodiesOpen
            emptyLabel={
              activity.loaded
                ? translate('team.room.empty', 'No team mail to or from this member yet.')
                : null
            }
          />
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          <TeamMemberQueue target={target} teamId={teamId} member={member} busy={busy} act={act} />
          <Textarea
            ref={draftRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={translate('team.room.placeholder', 'Tell this agent something…')}
            className="min-h-20"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <DictateButton targetRef={draftRef} />
            <Button
              size="sm"
              onClick={() => void submit('now')}
              disabled={busy || !member.live_handle}
            >
              <Send />
              {translate('team.room.sendNow', 'Send now')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void submit('queue')}
              disabled={busy}
            >
              <ListPlus />
              {translate('team.room.queueIt', 'Queue')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void submit('interrupt')}
              disabled={busy || !member.live_handle}
            >
              <Zap />
              {translate('team.room.interrupt', 'Interrupt and send')}
            </Button>
          </div>
        </div>
      </div>
      <details className="rounded-md border border-border px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-medium">
          {translate('team.room.capabilities', 'Capabilities')}
        </summary>
        <div className="pt-2">
          <TeamCapabilitiesEditor
            key={member.id}
            target={target}
            teamId={teamId}
            member={member}
            busy={busy}
            act={act}
          />
        </div>
      </details>
    </div>
  )
}
