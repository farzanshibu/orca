import React, { useMemo } from 'react'
import { Moon, Pause, Play, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { describeTeamMemberActivity } from './TeamAgentCard'
import { TeamMemberCapEditor } from './TeamMemberCapEditor'
import { TeamOfficeFloor } from './TeamOfficeFloor'
import { TeamVoicePanel } from './TeamVoicePanel'
import { TeamActivityList } from './team-activity-list'
import type { TeamAttention } from './team-attention'
import { isTeamBreakerPause } from './team-enum-labels'
import { buildTeamFeedRows, teamMailRows } from './team-feed-threads'
import { teamMemberLiveness } from './team-member-liveness'
import { Portrait, memberLook } from './office-floor-sprite'
import { TeamMemberStatusChip, teamMemberStatus } from './team-member-status'
import { callTeamClosingTime, setTeamMemberCap, updateTeam } from './team-runtime-client'
import {
  formatUsd,
  type TeamLogMessage,
  type TeamMember,
  type TeamSnapshot,
  type TeamTask
} from './team-snapshot-types'
import { teamMemberOwnedTasks, teamTaskSettled } from './team-task-owner'
import { isTeamTemp } from './team-temps'
import type { TeamActivity } from './use-team-activity'
import type { TeamAct } from './use-team-page-state'

function openTickets(member: TeamMember, snapshot: TeamSnapshot): TeamTask[] {
  return teamMemberOwnedTasks(member, snapshot.tasks, snapshot.members).filter(
    (task) => !teamTaskSettled(task)
  )
}

function TicketChips({ tickets }: { tickets: readonly TeamTask[] }): React.JSX.Element | null {
  if (tickets.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tickets.slice(0, 3).map((task) => (
        <span key={task.id} className="bureau-chip" data-tone="ok">
          {task.ref ?? task.id}
        </span>
      ))}
      {tickets.length > 3 ? <span className="bureau-chip">+{tickets.length - 3}</span> : null}
    </div>
  )
}

function ManagerCard({
  member,
  snapshot,
  attention,
  onOpen
}: {
  member: TeamMember
  snapshot: TeamSnapshot
  attention: TeamAttention
  onOpen: (memberId: string) => void
}): React.JSX.Element {
  const status = teamMemberStatus(member, attention.memberIds.has(member.id))
  const tickets = openTickets(member, snapshot)
  return (
    <button
      type="button"
      onClick={() => onOpen(member.id)}
      className="bureau-card flex w-full flex-col gap-2 p-3 text-left"
    >
      <div className="flex items-start gap-2">
        <Portrait look={memberLook(member.slug, true)} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{member.display_name}</div>
          <div className="truncate text-[11px] text-bureau-ink-soft">
            {translate('team.brain.orchestrator', 'Orchestrator')} · {member.role_slug}
          </div>
        </div>
        <TeamMemberStatusChip status={status} />
      </div>
      <p className="line-clamp-2 text-[12px]">{describeTeamMemberActivity(member, undefined)}</p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-bureau-ink-soft">
        <span>
          {translate('team.card.tokens', '{{tokens}} tokens', {
            tokens: (member.spend_tokens ?? 0).toLocaleString()
          })}
        </span>
        <span>
          {translate('team.brain.tickets', '{{count}} tickets', { count: tickets.length })}
        </span>
      </div>
      <TicketChips tickets={tickets} />
    </button>
  )
}

function AgentCard({
  member,
  snapshot,
  attention,
  onOpen
}: {
  member: TeamMember
  snapshot: TeamSnapshot
  attention: TeamAttention
  onOpen: (memberId: string) => void
}): React.JSX.Element {
  const status = teamMemberStatus(member, attention.memberIds.has(member.id))
  const tickets = openTickets(member, snapshot)
  return (
    <button
      type="button"
      onClick={() => onOpen(member.id)}
      className="bureau-graph-node bureau-card flex w-full items-start gap-2 p-2 text-left"
    >
      <Portrait look={memberLook(member.slug, false)} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold">{member.display_name}</span>
          <span className="bureau-dot" data-tone={status.tone} title={status.label} />
        </div>
        <div className="truncate text-[11px] text-bureau-ink-soft">{member.role_slug}</div>
        <div className="pt-1">
          <TicketChips tickets={tickets} />
        </div>
      </div>
    </button>
  )
}

function SpendCard({
  target,
  snapshot,
  busy,
  act
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const team = snapshot.team
  const spend = snapshot.members.reduce<number | null>(
    (sum, member) => (member.spend_usd === null ? sum : (sum ?? 0) + member.spend_usd),
    null
  )
  const cap = snapshot.members.reduce<number | null>(
    (sum, member) => (member.spend_cap_usd === null ? sum : (sum ?? 0) + member.spend_cap_usd),
    null
  )
  const tripped = snapshot.members.filter(
    (member) => member.paused_at && isTeamBreakerPause(member.pause_reason)
  )
  const percent = spend !== null && cap ? Math.min(100, (spend / cap) * 100) : 0
  const paused = team.status === 'paused'
  return (
    <section className="bureau-card space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bureau-display text-bureau-ink-soft">
          {translate('team.orchestrator.breaker', 'Breaker')}
        </span>
        <span className="bureau-chip" data-tone={tripped.length > 0 ? 'danger' : 'ok'}>
          <ShieldCheck className="size-3" />
          {tripped.length > 0
            ? translate('team.brain.breakerTripped', '{{count}} tripped', {
                count: tripped.length
              })
            : translate('team.brain.breakerOk', 'All clear')}
        </span>
        <div className="flex-1" />
        <span className="text-[12px] text-bureau-ink-soft">
          {cap !== null
            ? translate('team.brain.spendOfCap', '{{spend}} of {{cap}} cap', {
                spend: formatUsd(spend),
                cap: formatUsd(cap)
              })
            : translate('team.brain.spend', '{{spend}} spent', { spend: formatUsd(spend) })}
        </span>
      </div>
      <div
        className="bureau-gauge"
        data-tone={percent >= 100 ? 'danger' : percent >= 80 ? 'warn' : 'ok'}
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={translate('team.brain.spendGauge', 'Team spend against its cap')}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {tripped.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tripped.map((member) => (
            <span key={member.id} className="bureau-chip" data-tone="danger">
              {member.display_name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="xs"
          variant={paused ? 'default' : 'secondary'}
          disabled={busy}
          onClick={() =>
            void act(() =>
              updateTeam(target, { team: team.id, status: paused ? 'active' : 'paused' })
            )
          }
        >
          {paused ? <Play /> : <Pause />}
          {paused
            ? translate('team.orchestrator.resumeTeam', 'Resume the team')
            : translate('team.orchestrator.pauseTeam', 'Pause the team')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void act(() => callTeamClosingTime(target, team.id, Boolean(team.closing_at)))
          }
        >
          <Moon />
          {team.closing_at
            ? translate('team.orchestrator.cancelClosing', 'Call off closing time')
            : translate('team.orchestrator.closingTime', 'Closing time')}
        </Button>
      </div>
    </section>
  )
}

export function TeamBrainPanel({
  target,
  snapshot,
  attention,
  activity,
  log,
  selectedMemberId,
  onSelectMember,
  onAddMember,
  busy,
  act
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  attention: TeamAttention
  activity: TeamActivity
  log: readonly TeamLogMessage[]
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onAddMember: () => void
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const team = snapshot.team
  const manager = snapshot.members.find((member) => member.is_manager) ?? null
  const standing = snapshot.members.filter((member) => !member.is_manager && !isTeamTemp(member))
  const managerId = manager?.id
  const routing = useMemo(
    () =>
      teamMailRows(
        buildTeamFeedRows(activity.entries),
        managerId ? { kind: 'member', memberId: managerId } : { kind: 'all' }
      ),
    [activity.entries, managerId]
  )
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <section className="bureau-card space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="bureau-display">
            {translate('team.brain.graph', 'The floor and its orchestrator')}
          </h2>
          <span className="text-[12px] text-bureau-ink-soft">
            {translate('team.brain.live', '{{count}} live · {{tasks}} open tickets', {
              count: snapshot.members.filter((member) => teamMemberLiveness(member) !== 'stopped')
                .length,
              tasks: snapshot.tasks.filter((task) => !teamTaskSettled(task)).length
            })}
          </span>
        </div>
        {manager ? (
          <div className="grid gap-3 @2xl/team-dock:grid-cols-[minmax(200px,0.8fr)_minmax(0,1.7fr)]">
            <ManagerCard
              member={manager}
              snapshot={snapshot}
              attention={attention}
              onOpen={onSelectMember}
            />
            <div className="bureau-graph-bus grid content-start gap-2 @lg/team-dock:grid-cols-2">
              {standing.map((member) => (
                <AgentCard
                  key={member.id}
                  member={member}
                  snapshot={snapshot}
                  attention={attention}
                  onOpen={onSelectMember}
                />
              ))}
              <button
                type="button"
                onClick={onAddMember}
                className="bureau-card flex min-h-16 items-center justify-center gap-1.5 border-dashed p-2 text-[12px] text-bureau-ink-soft"
              >
                <Plus className="size-3.5" />
                {translate('team.page.addMember', 'Add member')}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-bureau-ink-soft">
            {translate(
              'team.orchestrator.noManager',
              'This team has no manager yet. Add a member and mark it as manager.'
            )}
          </p>
        )}
      </section>
      <SpendCard target={target} snapshot={snapshot} busy={busy} act={act} />
      <div className="grid gap-3 @3xl/team-dock:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="flex h-64 flex-col rounded-sm border-2 border-bureau-ink p-2">
          <div className="pb-2">
            <span className="bureau-display text-bureau-ink-soft">
              {translate('team.orchestrator.routingLog', 'Routing log')}
            </span>
          </div>
          <TeamActivityList
            rows={routing}
            members={snapshot.members}
            emptyLabel={
              activity.loaded ? translate('team.orchestrator.noRouting', 'No routing yet.') : null
            }
          />
        </section>
        {manager ? (
          <div className="space-y-3">
            <TeamVoicePanel
              target={target}
              teamId={team.id}
              manager={manager}
              log={log}
              busy={busy}
              act={act}
            />
            <section className="bureau-card space-y-2 p-3">
              <span className="bureau-display text-bureau-ink-soft">
                {translate('team.orchestrator.managerCap', 'Manager cap')}
              </span>
              <TeamMemberCapEditor
                key={manager.id}
                member={manager}
                busy={busy}
                onSave={(capUsd, tokenCap) =>
                  act(() =>
                    setTeamMemberCap(target, {
                      team: team.id,
                      member: manager.id,
                      capUsd,
                      tokenCap
                    })
                  )
                }
              />
            </section>
          </div>
        ) : null}
      </div>
      <details className="bureau-card p-2">
        <summary className="bureau-display cursor-pointer px-1 text-bureau-ink-soft">
          {translate('team.brain.floor', 'Office floor')}
        </summary>
        <div className="mt-2 h-[440px]">
          <TeamOfficeFloor
            teamName={team.name}
            members={snapshot.members}
            tasks={snapshot.tasks}
            goals={snapshot.goals}
            activity={activity}
            attention={attention}
            selectedMemberId={selectedMemberId}
            showRoster={false}
            onOpenRoom={onSelectMember}
            onAddMember={() => onAddMember()}
          />
        </div>
      </details>
      <p className="px-1 text-[11px] text-bureau-ink-soft">
        {translate(
          'team.brain.managerHint',
          'The manager reads the board, dispatches tickets and routes every question.'
        )}
      </p>
    </div>
  )
}
