import React, { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { TeamAgentRoom } from './TeamAgentRoom'
import { TeamPageHeaderActions } from './TeamPageHeaderActions'
import { TeamActionError, TeamConnectionLine, TeamLoadingLine } from './TeamPageNotices'
import { TeamPageTabs } from './TeamPageTabs'
import { TeamCreateDialog, TeamMemberDialog } from './TeamSetupDialogs'
import { TeamTemplateImportDialog } from './TeamTemplateImportDialog'
import { collectTeamAttention, NO_TEAM_ATTENTION } from './team-attention'
import {
  addTeamMember,
  createTeam,
  importTeamMember,
  type TeamMemberDraft
} from './team-runtime-client'
import { useTeamActivity } from './use-team-activity'
import { useTeamPageState, type TeamAct } from './use-team-page-state'

export default function TeamPage(): React.JSX.Element {
  const state = useTeamPageState()
  const { target, snapshot, act, pendingActions } = state
  // Polled here, above the tabs, so the feed keeps what it has when the tab changes.
  const activity = useTeamActivity(state)
  const [createOpen, setCreateOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [memberInitial, setMemberInitial] = useState<Partial<TeamMemberDraft> | undefined>()
  const openMemberDialog = (initial?: Partial<TeamMemberDraft>): void => {
    setMemberInitial(initial)
    setMemberOpen(true)
  }
  const [importOpen, setImportOpen] = useState(false)
  const [roomMemberId, setRoomMemberId] = useState<string | null>(null)
  const roomMember = snapshot?.members.find((member) => member.id === roomMemberId) ?? null
  // One list for the Inbox count, the floor's "?" markers and the summary line.
  const attention = useMemo(
    () => (snapshot ? collectTeamAttention(snapshot) : NO_TEAM_ATTENTION),
    [snapshot]
  )
  const scoped = (key: string): { busy: boolean; act: TeamAct } => ({
    busy: pendingActions.includes(key),
    act: (mutation) => act(mutation, key)
  })

  return (
    <div className="@container/team-page flex h-full min-h-0 w-full flex-col bg-background pt-5 md:pt-6">
      <header
        className="flex shrink-0 flex-wrap items-center gap-2 px-3 pb-3 md:px-5"
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
        <TeamPageHeaderActions
          target={target}
          snapshot={snapshot}
          canCreateTeam={Boolean(state.repoId)}
          pendingActions={pendingActions}
          act={act}
          onAddMember={openMemberDialog}
          onImportTemplate={() => setImportOpen(true)}
          onNewTeam={() => setCreateOpen(true)}
        />
      </header>
      {state.actionError ? (
        <TeamActionError message={state.actionError} onDismiss={state.dismissActionError} />
      ) : null}
      {state.repoId && state.connectionError ? (
        <TeamConnectionLine message={state.connectionError} />
      ) : null}
      {!state.repoId ? (
        <p className="px-5 text-[14px] text-muted-foreground">
          {translate('team.page.noRepo', 'Open a repository to see its team.')}
        </p>
      ) : snapshot ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-4 md:px-5">
          <TeamPageTabs
            state={state}
            snapshot={snapshot}
            attention={attention}
            activity={activity}
            scoped={scoped}
            onOpenRoom={setRoomMemberId}
            onAddMember={openMemberDialog}
          />
        </div>
      ) : !state.loaded || state.selectedTeamId ? (
        // Not "no team yet": nothing has answered for this repository or team so far.
        state.connectionError ? null : (
          <TeamLoadingLine />
        )
      ) : (
        <div className="px-5 text-[14px] text-muted-foreground">
          <p>{translate('team.page.empty', 'This repository has no team yet.')}</p>
          <Button className="mt-3" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            {translate('team.page.createFirst', 'Create a team')}
          </Button>
        </div>
      )}
      <TeamCreateDialog
        open={createOpen}
        repoName={state.repoName}
        busy={pendingActions.includes('team-create')}
        onOpenChange={setCreateOpen}
        onCreate={async (name, charter) => {
          const repoId = state.repoId
          if (!repoId) {
            return false
          }
          const ok = await act(
            () => createTeam(target, { repo: `id:${repoId}`, name, charter }),
            'team-create'
          )
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
          initial={memberInitial}
          hasManager={snapshot.members.some((member) => member.is_manager)}
          busy={pendingActions.includes('member-add')}
          onOpenChange={setMemberOpen}
          onAdd={async (draft) => {
            const ok = await act(() => addTeamMember(target, snapshot.team.id, draft), 'member-add')
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
          busy={pendingActions.includes('member-import')}
          onOpenChange={setImportOpen}
          onImport={async (template) => {
            const ok = await act(
              () => importTeamMember(target, { team: snapshot.team.id, template }),
              'member-import'
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
          members={snapshot.members}
          activity={activity}
          log={state.log}
          {...scoped('room')}
          onClose={() => setRoomMemberId(null)}
        />
      ) : null}
    </div>
  )
}
