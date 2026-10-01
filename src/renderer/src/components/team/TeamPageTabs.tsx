import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { TeamFloorWithFeed } from './TeamActivityFeed'
import { TeamAgentCard } from './TeamAgentCard'
import { TeamAutomationsPanel } from './TeamAutomationsPanel'
import { TeamInbox } from './TeamInbox'
import { TeamMemoryPanel } from './TeamMemoryPanel'
import { TeamOfficeFloor } from './TeamOfficeFloor'
import { TeamOrchestratorPanel } from './TeamOrchestratorPanel'
import { TeamTasksTab } from './TeamTasksTab'
import type { TeamAttention } from './team-attention'
import { isTeamPageTab } from './team-page-tab'
import { runTeamMemberAction, type TeamMemberDraft } from './team-runtime-client'
import type { TeamSnapshot } from './team-snapshot-types'
import { teamMemberCurrentTask } from './team-task-owner'
import type { TeamActivity } from './use-team-activity'
import { useTeamClock } from './use-team-clock'
import type { TeamAct, TeamPageState } from './use-team-page-state'

export function TeamPageTabs({
  state,
  snapshot,
  attention,
  activity,
  scoped,
  onOpenRoom,
  onAddMember
}: {
  state: TeamPageState
  snapshot: TeamSnapshot
  attention: TeamAttention
  activity: TeamActivity
  /** `act` bound to one key, with whether that key is in flight, so only its controls disable. */
  scoped: (key: string) => { busy: boolean; act: TeamAct }
  onOpenRoom: (memberId: string) => void
  /** Opens the hire dialog, starting from `initial` when a vacant desk asked for it. */
  onAddMember: (initial?: Partial<TeamMemberDraft>) => void
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
        <TeamFloorWithFeed activity={activity} members={snapshot.members}>
          <TeamOfficeFloor
            // Seats are remembered per mounted floor, so another team must start from an empty one.
            key={team}
            teamName={snapshot.team.name}
            members={snapshot.members}
            tasks={snapshot.tasks}
            goals={snapshot.goals}
            activity={activity}
            attention={attention}
            onOpenRoom={onOpenRoom}
            onAddMember={onAddMember}
          />
        </TeamFloorWithFeed>
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
          activity={activity}
          {...scoped('orchestrator')}
        />
      </TabsContent>
      <TabsContent value="tasks" className="flex min-h-0">
        <TeamTasksTab
          // What the host answered for an assignment belongs to the team it was made on.
          key={team}
          target={target}
          snapshot={snapshot}
          now={now}
          pendingActions={pendingActions}
          act={act}
        />
      </TabsContent>
      <TabsContent value="inbox" className="flex min-h-0">
        <TeamInbox
          target={target}
          snapshot={snapshot}
          attention={attention}
          activity={activity}
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
