import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { TeamAgentCard } from './TeamAgentCard'
import { TeamAutomationsPanel } from './TeamAutomationsPanel'
import { TeamInbox } from './TeamInbox'
import { TeamMemoryPanel } from './TeamMemoryPanel'
import { TeamOfficeFloor } from './TeamOfficeFloor'
import { TeamOrchestratorPanel } from './TeamOrchestratorPanel'
import { TeamTaskBoard } from './TeamTaskBoard'
import { TeamTaskComposer } from './TeamTaskComposer'
import type { TeamAttention } from './team-attention'
import { isTeamPageTab } from './team-page-tab'
import { runTeamMemberAction } from './team-runtime-client'
import type { TeamSnapshot } from './team-snapshot-types'
import { teamMemberCurrentTask } from './team-task-owner'
import { useTeamClock } from './use-team-clock'
import type { TeamAct, TeamPageState } from './use-team-page-state'

export function TeamPageTabs({
  state,
  snapshot,
  attention,
  scoped,
  onOpenRoom,
  onAddMember
}: {
  state: TeamPageState
  snapshot: TeamSnapshot
  attention: TeamAttention
  /** `act` bound to one key, with whether that key is in flight, so only its controls disable. */
  scoped: (key: string) => { busy: boolean; act: TeamAct }
  onOpenRoom: (memberId: string) => void
  onAddMember: () => void
}): React.JSX.Element {
  const { target, act, pendingActions } = state
  const tab = useAppStore((s) => s.teamPageTab)
  const setTab = useAppStore((s) => s.setTeamPageTab)
  const now = useTeamClock(30_000)
  const team = snapshot.team.id
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isTeamPageTab(value)) {
          setTab(value)
        }
      }}
      className="min-h-0 flex-1"
    >
      <TabsList>
        <TabsTrigger value="floor">{translate('team.tab.floor', 'Floor')}</TabsTrigger>
        <TabsTrigger value="agents">{translate('team.tab.agents', 'Agents')}</TabsTrigger>
        <TabsTrigger value="orchestrator">
          {translate('team.tab.orchestrator', 'Orchestrator')}
        </TabsTrigger>
        <TabsTrigger value="tasks">{translate('team.tab.tasks', 'Tasks')}</TabsTrigger>
        <TabsTrigger value="inbox">
          {attention.count > 0
            ? translate('team.tab.inboxCount', 'Inbox ({{count}})', { count: attention.count })
            : translate('team.tab.inbox', 'Inbox')}
        </TabsTrigger>
        <TabsTrigger value="automations">
          {translate('team.tab.automations', 'Automations')}
        </TabsTrigger>
        <TabsTrigger value="memory">{translate('team.tab.memory', 'Memory')}</TabsTrigger>
      </TabsList>
      <TabsContent value="floor" className="flex min-h-0">
        <TeamOfficeFloor
          members={snapshot.members}
          tasks={snapshot.tasks}
          log={state.log}
          attention={attention}
          onOpenRoom={onOpenRoom}
          onAddMember={onAddMember}
        />
      </TabsContent>
      <TabsContent value="agents" className="min-h-0">
        <div className="scrollbar-sleek h-full overflow-y-auto">
          {snapshot.members.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">
              {translate('team.page.noMembers', 'Add a manager and a few members to get started.')}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {snapshot.members.map((member) => (
                <TeamAgentCard
                  key={member.id}
                  member={member}
                  task={teamMemberCurrentTask(member, snapshot.tasks)}
                  busy={pendingActions.includes(member.id)}
                  onOpenRoom={onOpenRoom}
                  onAction={(acted, action) =>
                    void act(
                      () => runTeamMemberAction(target, { team, member: acted.id, action }),
                      acted.id
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="orchestrator" className="flex min-h-0">
        <TeamOrchestratorPanel
          target={target}
          snapshot={snapshot}
          log={state.log}
          {...scoped('orchestrator')}
        />
      </TabsContent>
      <TabsContent value="tasks" className="flex min-h-0">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <TeamTaskComposer target={target} teamId={team} {...scoped('task-create')} />
          <TeamTaskBoard tasks={snapshot.tasks} members={snapshot.members} now={now} />
        </div>
      </TabsContent>
      <TabsContent value="inbox" className="flex min-h-0">
        <TeamInbox
          target={target}
          snapshot={snapshot}
          attention={attention}
          log={state.log}
          pendingActions={pendingActions}
          act={act}
          onOpenRoom={onOpenRoom}
        />
      </TabsContent>
      <TabsContent value="automations" className="flex min-h-0">
        <TeamAutomationsPanel target={target} teamId={team} {...scoped('automations')} />
      </TabsContent>
      <TabsContent value="memory" className="flex min-h-0">
        <TeamMemoryPanel target={target} teamId={team} {...scoped('memory')} />
      </TabsContent>
    </Tabs>
  )
}
