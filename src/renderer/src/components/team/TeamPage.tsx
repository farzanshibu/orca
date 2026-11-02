import React, { useEffect, useMemo, useState } from 'react'
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
import { TeamAgentSheet } from './TeamAgentSheet'
import { TeamPageHeaderActions } from './TeamPageHeaderActions'
import { TeamActionError, TeamConnectionLine, TeamLoadingLine } from './TeamPageNotices'
import { TeamTaskDetailDialog } from './TeamTaskDetailDialog'
import { TeamWorkspace } from './TeamWorkspace'
import { TeamMemberRemoveDialog } from './TeamMemberRemoveDialog'
import { TeamCreateDialog, TeamMemberDialog } from './TeamSetupDialogs'
import { TeamTemplateImportDialog } from './TeamTemplateImportDialog'
import { collectTeamAttention, NO_TEAM_ATTENTION } from './team-attention'
import {
  addTeamMember,
  createTeam,
  importTeamMember,
  runTeamMemberAction,
  updateTeamMember,
  type TeamMemberDraft
} from './team-runtime-client'
import type { TeamTask } from './team-snapshot-types'
import { useTeamTempRetirement } from './team-temps'
import { useTeamActivity } from './use-team-activity'
import { useTeamPageState, type TeamAct } from './use-team-page-state'

export default function TeamPage(): React.JSX.Element {
  const state = useTeamPageState()
  const { target, snapshot, act, pendingActions } = state
  // Polled here, above the Command Center, so the feed keeps what it has when the section changes.
  const activity = useTeamActivity(state)
  const [createOpen, setCreateOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [memberInitial, setMemberInitial] = useState<Partial<TeamMemberDraft> | undefined>()
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const openMemberDialog = (initial?: Partial<TeamMemberDraft>): void => {
    setMemberInitial(initial)
    setEditingMemberId(null)
    setMemberOpen(true)
  }
  const editingMember = snapshot?.members.find((member) => member.id === editingMemberId) ?? null
  const removingMember = snapshot?.members.find((member) => member.id === removingMemberId) ?? null
  const [importOpen, setImportOpen] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [memberSheetOpen, setMemberSheetOpen] = useState(false)
  const [detailTask, setDetailTask] = useState<TeamTask | null>(null)
  // The strip is always showing a member: fall back to the manager, then the first hire.
  useEffect(() => {
    const members = snapshot?.members ?? []
    if (!members.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId((members.find((member) => member.is_manager) ?? members[0])?.id ?? null)
    }
  }, [snapshot, selectedMemberId])
  const selectMember = (memberId: string): void => {
    setSelectedMemberId(memberId)
    setMemberSheetOpen(true)
  }
  useTeamTempRetirement({
    target,
    snapshot,
    pendingActions,
    act
  })
  // One list for the Inbox count, the floor's "?" markers and the summary line.
  const attention = useMemo(
    () => (snapshot ? collectTeamAttention(snapshot) : NO_TEAM_ATTENTION),
    [snapshot]
  )
  const scoped = (key: string): { busy: boolean; act: TeamAct } => ({
    busy: pendingActions.includes(key),
    act: (mutation) => act(mutation, key)
  })
  const selectedMember = snapshot?.members.find((member) => member.id === selectedMemberId) ?? null

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
        <div className="flex min-h-0 flex-1 flex-col">
          <TeamWorkspace
            state={state}
            snapshot={snapshot}
            attention={attention}
            activity={activity}
            selectedMemberId={selectedMemberId}
            onSelectMember={selectMember}
            scoped={scoped}
            onAddMember={openMemberDialog}
            onEditMember={(member) => {
              setMemberInitial(undefined)
              setEditingMemberId(member.id)
              setMemberOpen(true)
            }}
            onRemoveMember={(member) => setRemovingMemberId(member.id)}
            onOpenTask={setDetailTask}
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
          // Remounting per mode and per member is what resets the form between one hire and the next.
          key={memberOpen ? (editingMember?.id ?? 'add') : 'closed'}
          open={memberOpen}
          initial={memberInitial}
          editing={editingMember ?? undefined}
          hasManager={snapshot.members.some((member) => member.is_manager)}
          busy={pendingActions.includes(editingMember ? 'member-edit' : 'member-add')}
          onOpenChange={setMemberOpen}
          onSubmit={async (draft) => {
            const member = editingMember
            const actionKey = member ? 'member-edit' : 'member-add'
            const ok = await act(
              () =>
                member
                  ? updateTeamMember(target, {
                      team: snapshot.team.id,
                      member: member.id,
                      // An update cannot change the slug, the manager flag or capabilities.
                      displayName: draft.displayName,
                      role: draft.role,
                      brief: draft.brief,
                      agent: draft.agent,
                      model: draft.model
                    })
                  : addTeamMember(target, snapshot.team.id, draft),
              actionKey
            )
            if (ok) {
              setMemberOpen(false)
              setEditingMemberId(null)
            }
            return ok
          }}
        />
      ) : null}
      {snapshot ? (
        <TeamMemberRemoveDialog
          member={removingMember}
          busy={pendingActions.includes('member-remove')}
          onCancel={() => setRemovingMemberId(null)}
          onConfirm={async (member) => {
            const ok = await act(
              () =>
                runTeamMemberAction(target, {
                  team: snapshot.team.id,
                  member: member.id,
                  action: 'Remove'
                }),
              'member-remove'
            )
            if (ok) {
              setRemovingMemberId(null)
              setMemberSheetOpen(false)
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
        <TeamAgentSheet
          open={memberSheetOpen && Boolean(selectedMember)}
          onOpenChange={setMemberSheetOpen}
          target={target}
          teamId={snapshot.team.id}
          member={selectedMember}
          members={snapshot.members}
          tasks={snapshot.tasks}
          activity={activity}
          log={state.log}
          busy={selectedMember ? pendingActions.includes(selectedMember.id) : false}
          act={selectedMember ? scoped(selectedMember.id).act : act}
          onAction={(member, action) =>
            void act(
              () =>
                runTeamMemberAction(target, {
                  team: snapshot.team.id,
                  member: member.id,
                  action
                }),
              member.id
            )
          }
          onEdit={(member) => {
            setMemberInitial(undefined)
            setEditingMemberId(member.id)
            setMemberOpen(true)
          }}
          onRemove={(member) => setRemovingMemberId(member.id)}
          onOpenTask={(task) => {
            setMemberSheetOpen(false)
            setDetailTask(task)
          }}
        />
      ) : null}
      {snapshot ? (
        <TeamTaskDetailDialog
          task={detailTask}
          snapshot={snapshot}
          onOpenMember={(memberId) => {
            setDetailTask(null)
            selectMember(memberId)
          }}
          onClose={() => setDetailTask(null)}
        />
      ) : null}
    </div>
  )
}
