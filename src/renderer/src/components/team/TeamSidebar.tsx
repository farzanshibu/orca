import React from 'react'
import {
  BellRing,
  Brain,
  CheckSquare,
  Clock,
  Hourglass,
  Plus,
  Settings,
  Sparkles,
  Users
} from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Portrait, memberLook } from './office-floor-sprite'
import type { TeamAttention } from './team-attention'
import { isTeamPageTab, type TeamPageTab } from './team-page-tab'
import { teamMemberLiveness } from './team-member-liveness'
import { teamMemberStatus } from './team-member-status'
import type { TeamSnapshot } from './team-snapshot-types'
import { isTeamTemp } from './team-temps'

type NavItem = {
  key: TeamPageTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export function TeamSidebar({
  snapshot,
  attention,
  selectedMemberId,
  onSelectMember,
  onAddMember,
  onOpenSettings
}: {
  snapshot: TeamSnapshot
  attention: TeamAttention
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onAddMember: () => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const tab = useAppStore((s) => s.teamPageTab)
  const setTab = useAppStore((s) => s.setTeamPageTab)
  const current: TeamPageTab = isTeamPageTab(tab) ? tab : 'orchestrator'
  const standing = snapshot.members.filter((member) => !isTeamTemp(member))
  const temps = snapshot.members.filter(isTeamTemp)
  const live = standing.filter((member) => teamMemberLiveness(member) !== 'stopped').length

  const nav: readonly NavItem[] = [
    { key: 'tasks', label: translate('team.tab.tasks', 'Tasks'), icon: CheckSquare },
    { key: 'inbox', label: translate('team.tab.inbox', 'Inbox'), icon: BellRing },
    { key: 'automations', label: translate('team.tab.automations', 'Automations'), icon: Clock },
    { key: 'memory', label: translate('team.tab.memory', 'Memory'), icon: Brain },
    {
      key: 'capabilities',
      label: translate('team.tab.capabilities', 'Capabilities'),
      icon: Sparkles
    }
  ]

  return (
    <aside
      aria-label={translate('team.sidebar.nav', 'Team sections')}
      className="bureau-panel bureau-sidebar flex w-14 shrink-0 flex-col overflow-hidden @2xl/team-page:w-52"
    >
      <button
        type="button"
        aria-label={translate('team.sidebar.brain', 'Team brain')}
        data-active={current === 'orchestrator' ? 'true' : undefined}
        onClick={() => setTab('orchestrator')}
        className="bureau-sidebar-brand"
      >
        <span className="flex size-9 shrink-0 items-center justify-center border-2 border-bureau-ink bg-bureau-lemon">
          <Brain className="size-4" />
        </span>
        <span className="hidden min-w-0 flex-1 @2xl/team-page:block">
          <span className="bureau-display block truncate">{snapshot.team.name}</span>
          <span className="block truncate text-[11px] text-bureau-ink-soft">
            {translate('team.sidebar.brain', 'Team brain')}
          </span>
        </span>
      </button>
      <nav className="flex flex-col gap-0.5 p-1.5">
        {nav.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-current={current === key ? 'page' : undefined}
            data-active={current === key ? 'true' : undefined}
            onClick={() => setTab(key)}
            className="bureau-sidebar-item"
          >
            <Icon className="size-4 shrink-0" />
            <span className="hidden min-w-0 flex-1 truncate @2xl/team-page:block">{label}</span>
            {key === 'inbox' && attention.count > 0 ? (
              <span className="bureau-nav-count">{attention.count}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto border-t-2 border-bureau-ink p-1.5">
        <button
          type="button"
          aria-label={translate('team.tab.agents', 'Agents')}
          aria-current={current === 'agents' ? 'page' : undefined}
          data-active={current === 'agents' ? 'true' : undefined}
          onClick={() => setTab('agents')}
          className="bureau-sidebar-item"
        >
          <Users className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate @2xl/team-page:block">
            {translate('team.tab.agents', 'Agents')}
          </span>
          <span className="hidden text-[10px] text-bureau-ink-soft @2xl/team-page:block">
            {translate('team.sidebar.live', '{{count}} live', { count: live })}
          </span>
        </button>
        <div className="bureau-sidebar-group hidden @2xl/team-page:block">
          {translate('team.sidebar.members', 'Members')}
        </div>
        {standing.map((member) => {
          const status = teamMemberStatus(member, attention.memberIds.has(member.id))
          return (
            <button
              key={member.id}
              type="button"
              aria-label={translate('team.sidebar.openMember', 'Open {{name}} · {{status}}', {
                name: member.display_name,
                status: status.label
              })}
              data-active={member.id === selectedMemberId ? 'true' : undefined}
              onClick={() => onSelectMember(member.id)}
              className="bureau-sidebar-item bureau-sidebar-member"
            >
              <Portrait look={memberLook(member.slug, Boolean(member.is_manager))} size={22} />
              <span className="hidden min-w-0 flex-1 truncate @2xl/team-page:block">
                {member.display_name}
              </span>
              <span className="bureau-dot" data-tone={status.tone} title={status.label} />
            </button>
          )
        })}
        <button
          type="button"
          aria-label={translate('team.page.addMember', 'Add member')}
          onClick={onAddMember}
          className="bureau-sidebar-item"
        >
          <Plus className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate @2xl/team-page:block">
            {translate('team.page.addMember', 'Add member')}
          </span>
        </button>
        <button
          type="button"
          aria-label={translate('team.tab.temps', 'Temps')}
          aria-current={current === 'temps' ? 'page' : undefined}
          data-active={current === 'temps' ? 'true' : undefined}
          onClick={() => setTab('temps')}
          className="bureau-sidebar-item"
        >
          <Hourglass className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate @2xl/team-page:block">
            {translate('team.tab.temps', 'Temps')}
          </span>
          {temps.length > 0 ? <span className="bureau-nav-count">{temps.length}</span> : null}
        </button>
      </div>
      <div className="border-t-2 border-bureau-ink p-1.5">
        <button
          type="button"
          aria-label={translate('team.commandCenter.settings', 'Team settings')}
          onClick={onOpenSettings}
          className="bureau-sidebar-item"
        >
          <Settings className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate @2xl/team-page:block">
            {translate('team.commandCenter.settings', 'Team settings')}
          </span>
        </button>
      </div>
    </aside>
  )
}
