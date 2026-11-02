import React from 'react'
import { BellRing, Brain, CheckSquare, Clock, Cpu, Hourglass, Sparkles, Users } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Portrait, memberLook } from './office-floor-sprite'
import { TeamAgentsTab } from './TeamAgentsTab'
import { TeamAutomationsPanel } from './TeamAutomationsPanel'
import { TeamBrainPanel } from './TeamBrainPanel'
import { TeamCapabilitiesPanel } from './TeamCapabilitiesPanel'
import { TeamInbox } from './TeamInbox'
import { TeamMemoryPanel } from './TeamMemoryPanel'
import { TeamTasksTab } from './TeamTasksTab'
import { TeamTempsPanel } from './TeamTempsPanel'
import type { TeamAttention } from './team-attention'
import { isTeamPageTab, type TeamPageTab } from './team-page-tab'
import { runTeamMemberAction, type TeamMemberDraft } from './team-runtime-client'
import type { TeamLogMessage, TeamMember, TeamSnapshot, TeamTask } from './team-snapshot-types'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamActivity } from './use-team-activity'
import { useTeamClock } from './use-team-clock'
import type { TeamAct, TeamPageState } from './use-team-page-state'

function sectionTitle(tab: TeamPageTab): string {
  switch (tab) {
    case 'orchestrator':
      return translate('team.brain.title', 'Team brain')
    case 'agents':
      return translate('team.tab.agents', 'Agents')
    case 'tasks':
      return translate('team.tab.tasks', 'Tasks')
    case 'inbox':
      return translate('team.tab.inbox', 'Inbox')
    case 'automations':
      return translate('team.tab.automations', 'Automations')
    case 'memory':
      return translate('team.tab.memory', 'Memory')
    case 'capabilities':
      return translate('team.tab.capabilities', 'Capabilities')
    case 'temps':
      return translate('team.tab.temps', 'Temps')
  }
}

function SectionIcon({ tab }: { tab: TeamPageTab }): React.JSX.Element | null {
  const Icon =
    tab === 'tasks'
      ? CheckSquare
      : tab === 'inbox'
        ? BellRing
        : tab === 'automations'
          ? Clock
          : tab === 'memory'
            ? Brain
            : tab === 'capabilities'
              ? Sparkles
              : tab === 'temps'
                ? Hourglass
                : tab === 'agents'
                  ? Users
                  : Cpu
  return (
    <span className="flex size-9 shrink-0 items-center justify-center border-2 border-bureau-ink bg-bureau-paper-deep">
      <Icon className="size-4" />
    </span>
  )
}

function sectionSubtitle(
  tab: TeamPageTab,
  snapshot: TeamSnapshot,
  attention: TeamAttention
): string {
  const standing = snapshot.members.filter((member) => member.role_slug !== 'temp')
  const live = standing.filter((member) => teamMemberLiveness(member) !== 'stopped').length
  switch (tab) {
    case 'orchestrator':
      return translate('team.brain.subtitle', 'One agent runs the others for {{team}}.', {
        team: snapshot.team.name
      })
    case 'agents':
      return translate('team.agents.subtitle', '{{count}} agents · {{live}} live', {
        count: standing.length,
        live
      })
    case 'tasks':
      return translate('team.tasks.subtitle', '{{count}} open tickets on the board', {
        count: snapshot.tasks.filter(
          (task) => task.status !== 'completed' && task.status !== 'failed'
        ).length
      })
    case 'inbox':
      return translate('team.inbox.subtitle', '{{count}} waiting on you', {
        count: attention.count
      })
    case 'automations':
      return translate(
        'team.auto.subtitle',
        'Scheduled missions, context rules and webhooks that run the floor.'
      )
    case 'memory':
      return translate('team.memory.subtitle', 'What the floor knows, by topic and agent.')
    case 'capabilities':
      return translate(
        'team.capabilities.subtitle',
        'Skills, bundles and connections, managed per agent.'
      )
    case 'temps':
      return translate('team.temps.subtitle', 'Temporary agents for one job, gone when it is done.')
  }
}

export function TeamCommandCenter({
  state,
  snapshot,
  attention,
  activity,
  selectedMemberId,
  onSelectMember,
  scoped,
  onAddMember,
  onEditMember,
  onRemoveMember,
  onOpenTask,
  onOpenSettings
}: {
  state: TeamPageState
  snapshot: TeamSnapshot
  attention: TeamAttention
  activity: TeamActivity
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  scoped: (key: string) => { busy: boolean; act: TeamAct }
  onAddMember: (initial?: Partial<TeamMemberDraft>) => void
  onEditMember: (member: TeamMember) => void
  onRemoveMember: (member: TeamMember) => void
  onOpenTask: (task: TeamTask) => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const { target, act, pendingActions } = state
  const tab = useAppStore((s) => s.teamPageTab)
  const now = useTeamClock(30_000)
  const current: TeamPageTab = isTeamPageTab(tab) ? tab : 'orchestrator'
  const team = snapshot.team
  const selectedMember = snapshot.members.find((member) => member.id === selectedMemberId) ?? null
  const manager = snapshot.members.find((member) => member.is_manager) ?? null
  const log: readonly TeamLogMessage[] = state.log

  const memberAction = (
    member: TeamMember,
    action: Parameters<typeof runTeamMemberAction>[1]['action']
  ): void => {
    void act(
      () => runTeamMemberAction(target, { team: team.id, member: member.id, action }),
      member.id
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-bureau-ink bg-bureau-paper px-3 py-2">
        {current === 'orchestrator' && manager ? (
          <Portrait look={memberLook(manager.slug, true)} size={36} />
        ) : (
          <SectionIcon tab={current} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="bureau-display truncate">
              {current === 'orchestrator' && manager ? manager.display_name : sectionTitle(current)}
            </span>
            {current === 'orchestrator' ? (
              <span className="bureau-chip" data-tone="accent">
                {translate('team.brain.orchestrator', 'Orchestrator')}
              </span>
            ) : null}
            {current === 'inbox' && attention.count > 0 ? (
              <span className="bureau-nav-count">{attention.count}</span>
            ) : null}
          </div>
          <div className="truncate text-[12px] text-bureau-ink-soft">
            {sectionSubtitle(current, snapshot, attention)}
          </div>
        </div>
        <button
          type="button"
          aria-label={translate('team.commandCenter.settings', 'Team settings')}
          onClick={onOpenSettings}
          className="bureau-button shrink-0"
        >
          {translate('team.tab.settings', 'Settings')}
        </button>
      </div>
      <div className="@container/team-dock flex min-h-0 flex-1 flex-col overflow-hidden bg-bureau-paper">
        {current === 'orchestrator' ? (
          <TeamBrainPanel
            target={target}
            snapshot={snapshot}
            attention={attention}
            activity={activity}
            log={log}
            selectedMemberId={selectedMemberId}
            onSelectMember={onSelectMember}
            onAddMember={() => onAddMember()}
            {...scoped('orchestrator')}
          />
        ) : null}
        {current === 'agents' ? (
          <TeamAgentsTab
            snapshot={snapshot}
            attention={attention}
            log={log}
            pendingActions={pendingActions}
            onOpenMember={onSelectMember}
            onAction={memberAction}
            onEdit={onEditMember}
            onRemove={onRemoveMember}
            onAddMember={() => onAddMember()}
          />
        ) : null}
        {current === 'tasks' ? (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <TeamTasksTab
              key={team.id}
              target={target}
              snapshot={snapshot}
              now={now}
              pendingActions={pendingActions}
              act={act}
              onOpenTask={onOpenTask}
            />
          </div>
        ) : null}
        {current === 'inbox' ? (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <TeamInbox
              target={target}
              snapshot={snapshot}
              attention={attention}
              activity={activity}
              pendingActions={pendingActions}
              act={act}
              onOpenRoom={onSelectMember}
            />
          </div>
        ) : null}
        {current === 'automations' ? (
          <TeamAutomationsPanel target={target} teamId={team.id} {...scoped('automations')} />
        ) : null}
        {current === 'memory' ? (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <TeamMemoryPanel
              target={target}
              teamId={team.id}
              members={snapshot.members}
              {...scoped('memory')}
            />
          </div>
        ) : null}
        {current === 'capabilities' ? (
          <TeamCapabilitiesPanel
            target={target}
            teamId={team.id}
            members={snapshot.members}
            member={selectedMember ?? manager}
            onEditMember={onEditMember}
            onAddMember={onAddMember}
            {...scoped('capabilities')}
          />
        ) : null}
        {current === 'temps' ? (
          <TeamTempsPanel
            target={target}
            snapshot={snapshot}
            pendingActions={pendingActions}
            act={act}
            onOpenMember={onSelectMember}
          />
        ) : null}
      </div>
    </div>
  )
}
