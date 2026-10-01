import React, { useState } from 'react'
import { FileInput, MoreHorizontal, Plus, Target, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { TEAM_GOAL_CREATE_ACTION, TeamGoalDialog, teamGoalBlockerMessage } from './TeamGoalDialog'
import type { TeamMemberDraft } from './team-runtime-client'
import type { TeamSnapshot } from './team-snapshot-types'
import { useTeamFanoutSupport } from './use-team-fanout-support'
import type { TeamAct } from './use-team-page-state'

/**
 * The header's actions. With a manager the one primary action is New goal; without one it is
 * adding the manager, since nobody else can plan a goal.
 */
export function TeamPageHeaderActions({
  target,
  snapshot,
  canCreateTeam,
  pendingActions,
  act,
  onAddMember,
  onImportTemplate,
  onNewTeam
}: {
  target: RuntimeClientTarget
  /** Null while no team is shown, which leaves New team as the only action. */
  snapshot: TeamSnapshot | null
  canCreateTeam: boolean
  pendingActions: readonly string[]
  act: TeamAct
  onAddMember: (initial?: Partial<TeamMemberDraft>) => void
  onImportTemplate: () => void
  onNewTeam: () => void
}): React.JSX.Element {
  const support = useTeamFanoutSupport(target)
  const [goalOpen, setGoalOpen] = useState(false)
  const newTeamLabel = translate('team.page.newTeam', 'New team')
  if (!snapshot) {
    return (
      <Button size="sm" variant="ghost" disabled={!canCreateTeam} onClick={onNewTeam}>
        <Plus />
        {newTeamLabel}
      </Button>
    )
  }
  const hasManager = snapshot.members.some((member) => member.is_manager)
  const addMemberLabel = translate('team.page.addMember', 'Add member')
  const newGoal = (
    <Button size="sm" disabled={support === 'unsupported'} onClick={() => setGoalOpen(true)}>
      <Target />
      {translate('team.page.newGoal', 'New goal')}
    </Button>
  )
  return (
    <>
      {hasManager ? (
        <Button size="sm" variant="secondary" onClick={() => onAddMember()}>
          <UserPlus />
          {addMemberLabel}
        </Button>
      ) : null}
      {!hasManager ? (
        <Button size="sm" onClick={() => onAddMember({ manager: true })}>
          <UserPlus />
          {translate('team.page.addManager', 'Add a manager')}
        </Button>
      ) : support === 'unsupported' ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A disabled button fires no pointer events, so the span carries the tooltip. */}
            <span tabIndex={0}>{newGoal}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {teamGoalBlockerMessage('host_unsupported', snapshot.team.status)}
          </TooltipContent>
        </Tooltip>
      ) : (
        newGoal
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={translate('team.page.moreActions', 'More team actions')}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hasManager ? null : (
            <DropdownMenuItem onSelect={() => onAddMember()}>
              <UserPlus />
              {addMemberLabel}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onImportTemplate}>
            <FileInput />
            {translate('team.page.importTemplate', 'Import template')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canCreateTeam} onSelect={onNewTeam}>
            <Plus />
            {newTeamLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TeamGoalDialog
        // A draft and a host's refusal belong to the team they were for.
        key={snapshot.team.id}
        open={goalOpen}
        target={target}
        snapshot={snapshot}
        support={support}
        busy={pendingActions.includes(TEAM_GOAL_CREATE_ACTION)}
        act={act}
        onOpenChange={setGoalOpen}
      />
    </>
  )
}
