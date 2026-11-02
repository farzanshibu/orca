import React, { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { translate } from '@/i18n/i18n'
import { TeamCommandCenter } from './TeamCommandCenter'
import { TeamSettingsPanel } from './TeamSettingsPanel'
import { TeamSidebar } from './TeamSidebar'
import type { TeamAttention } from './team-attention'
import type { TeamMemberDraft } from './team-runtime-client'
import type { TeamMember, TeamSnapshot, TeamTask } from './team-snapshot-types'
import type { TeamActivity } from './use-team-activity'
import type { TeamAct, TeamPageState } from './use-team-page-state'

export function TeamWorkspace({
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
  onOpenTask
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
}): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <div className="@container/team-page team-bureau flex min-h-0 flex-1 gap-2 px-3 pb-2 md:px-5">
      <TeamSidebar
        snapshot={snapshot}
        attention={attention}
        selectedMemberId={selectedMemberId}
        onSelectMember={onSelectMember}
        onAddMember={() => onAddMember()}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="bureau-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TeamCommandCenter
          state={state}
          snapshot={snapshot}
          attention={attention}
          activity={activity}
          selectedMemberId={selectedMemberId}
          onSelectMember={onSelectMember}
          scoped={scoped}
          onAddMember={onAddMember}
          onEditMember={onEditMember}
          onRemoveMember={onRemoveMember}
          onOpenTask={onOpenTask}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </main>
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[560px]">
          <div className="border-b-2 border-bureau-ink pr-10">
            <SheetHeader>
              <SheetTitle>{translate('team.settings.title', 'Team settings')}</SheetTitle>
              <SheetDescription>
                {translate('team.settings.description', 'Charter, status and how the floor runs.')}
              </SheetDescription>
            </SheetHeader>
          </div>
          <TeamSettingsPanel
            key={snapshot.team.id}
            target={state.target}
            snapshot={snapshot}
            {...scoped('settings')}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
