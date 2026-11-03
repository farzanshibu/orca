import React, { useState } from 'react'
import { FileInput, Plus, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { TeamAgentCard } from './TeamAgentCard'
import { TeamAgentRoom } from './TeamAgentRoom'
import { TeamAutomationsPanel } from './TeamAutomationsPanel'
import { TeamMemoryPanel } from './TeamMemoryPanel'
import { TeamOfficeFloor } from './TeamOfficeFloor'
import { TeamTaskComposer } from './TeamTaskComposer'
import { TeamInbox } from './TeamInbox'
import { TeamOrchestratorPanel } from './TeamOrchestratorPanel'
import { TeamCreateDialog, TeamMemberDialog } from './TeamSetupDialogs'
import { TeamTaskBoard } from './TeamTaskBoard'
import { useTeamClock } from './use-team-clock'
import { TeamTemplateImportDialog } from './TeamTemplateImportDialog'
import {
  addTeamMember,
  createTeam,
  importTeamMember,
  runTeamMemberAction
} from './team-runtime-client'
import { useTeamPageState } from './use-team-page-state'

export default function TeamPage(): React.JSX.Element {
  const state = useTeamPageState()
  const { target, snapshot, act } = state
  const [createOpen, setCreateOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [roomMemberId, setRoomMemberId] = useState<string | null>(null)
  const now = useTeamClock(30_000)
  const roomMember = snapshot?.members.find((member) => member.id === roomMemberId) ?? null
  const waiting = snapshot
    ? snapshot.pendingQuestions.length + snapshot.pendingGates.length + snapshot.pendingHires.length
    : 0

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <header
        className="flex shrink-0 items-center gap-2 px-3 pb-3 md:px-5"
        style={{ paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))' }}
      >
        <h1 className="truncate text-base font-semibold leading-8">
          {translate('team.page.title', 'Team')}
        </h1>
        {state.teams.length > 0 ? (
          <Select value={state.selectedTeamId ?? undefined} onValueChange={state.selectTeam}>
            <SelectTrigger size="sm" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex-1" />
        {snapshot ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setMemberOpen(true)}>
              <UserPlus />
              {translate('team.page.addMember', 'Add member')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
              <FileInput />
              {translate('team.page.importTemplate', 'Import template')}
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={!state.repoId}
          onClick={() => setCreateOpen(true)}
        >
          <Plus />
          {translate('team.page.newTeam', 'New team')}
        </Button>
      </header>
      {state.error ? (
        <div className="mx-5 mb-2 rounded-md border border-destructive/40 px-3 py-2 text-[13px] text-destructive">
          {state.error}
        </div>
      ) : null}
      {!state.repoId ? (
        <p className="px-5 text-[14px] text-muted-foreground">
          {translate('team.page.noRepo', 'Open a repository to see its team.')}
        </p>
      ) : !snapshot ? (
        <div className="px-5 text-[14px] text-muted-foreground">
          <p>{translate('team.page.empty', 'This repository has no team yet.')}</p>
          <Button className="mt-3" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            {translate('team.page.createFirst', 'Create a team')}
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
          <Tabs defaultValue="floor" className="min-h-0 flex-1">
            <TabsList>
              <TabsTrigger value="floor">{translate('team.tab.floor', 'Floor')}</TabsTrigger>
              <TabsTrigger value="agents">{translate('team.tab.agents', 'Agents')}</TabsTrigger>
              <TabsTrigger value="orchestrator">
                {translate('team.tab.orchestrator', 'Orchestrator')}
              </TabsTrigger>
              <TabsTrigger value="tasks">{translate('team.tab.tasks', 'Tasks')}</TabsTrigger>
              <TabsTrigger value="inbox">
                {waiting > 0
                  ? translate('team.tab.inboxCount', 'Inbox ({{count}})', { count: waiting })
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
                onOpenRoom={setRoomMemberId}
                onAddMember={() => setMemberOpen(true)}
              />
            </TabsContent>
            <TabsContent value="agents" className="min-h-0">
              <div className="scrollbar-sleek h-full overflow-y-auto">
                {snapshot.members.length === 0 ? (
                  <p className="text-[14px] text-muted-foreground">
                    {translate(
                      'team.page.noMembers',
                      'Add a manager and a few members to get started.'
                    )}
                  </p>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                    {snapshot.members.map((member) => (
                      <TeamAgentCard
                        key={member.id}
                        member={member}
                        task={snapshot.tasks.find(
                          (task) =>
                            task.status === 'dispatched' &&
                            task.assignee_handle !== null &&
                            task.assignee_handle === member.live_handle
                        )}
                        onOpenRoom={setRoomMemberId}
                        onAction={(target_, action) =>
                          void act(() =>
                            runTeamMemberAction(target, {
                              team: snapshot.team.id,
                              member: target_.id,
                              action
                            })
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
                act={act}
              />
            </TabsContent>
            <TabsContent value="tasks" className="flex min-h-0">
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <TeamTaskComposer target={target} teamId={snapshot.team.id} act={act} />
                <TeamTaskBoard tasks={snapshot.tasks} members={snapshot.members} now={now} />
              </div>
            </TabsContent>
            <TabsContent value="inbox" className="flex min-h-0">
              <TeamInbox target={target} snapshot={snapshot} log={state.log} act={act} />
            </TabsContent>
            <TabsContent value="automations" className="flex min-h-0">
              <TeamAutomationsPanel target={target} teamId={snapshot.team.id} act={act} />
            </TabsContent>
            <TabsContent value="memory" className="flex min-h-0">
              <TeamMemoryPanel target={target} teamId={snapshot.team.id} act={act} />
            </TabsContent>
          </Tabs>
        </div>
      )}
      <TeamCreateDialog
        open={createOpen}
        repoName={state.repoName}
        onOpenChange={setCreateOpen}
        onCreate={async (name, charter) => {
          const repoId = state.repoId
          if (!repoId) {
            return false
          }
          const ok = await act(() => createTeam(target, { repo: `id:${repoId}`, name, charter }))
          if (ok) {
            setCreateOpen(false)
          }
          return ok
        }}
      />
      {snapshot ? (
        <TeamMemberDialog
          key={memberOpen ? 'open' : 'closed'}
          open={memberOpen}
          hasManager={snapshot.members.some((member) => member.is_manager)}
          onOpenChange={setMemberOpen}
          onAdd={async (draft) => {
            const ok = await act(() => addTeamMember(target, snapshot.team.id, draft))
            if (ok) {
              setMemberOpen(false)
            }
            return ok
          }}
        />
      ) : null}
      {snapshot ? (
        <TeamTemplateImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={async (template) => {
            const ok = await act(() =>
              importTeamMember(target, { team: snapshot.team.id, template })
            )
            if (ok) {
              setImportOpen(false)
            }
            return ok
          }}
        />
      ) : null}
      {snapshot ? (
        <TeamAgentRoom
          target={target}
          teamId={snapshot.team.id}
          member={roomMember}
          log={state.log}
          act={act}
          onClose={() => setRoomMemberId(null)}
        />
      ) : null}
    </div>
  )
}
