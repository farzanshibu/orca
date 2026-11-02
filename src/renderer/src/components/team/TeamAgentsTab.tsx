import React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { TeamAgentCard } from './TeamAgentCard'
import type { TeamAttention } from './team-attention'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamMemberAction } from './team-runtime-client'
import type { TeamLogMessage, TeamMember, TeamSnapshot } from './team-snapshot-types'
import { teamMemberCurrentTask, teamMemberOwnedTasks, teamTaskSettled } from './team-task-owner'
import { isTeamTemp } from './team-temps'

function latestSnippet(member: TeamMember, log: readonly TeamLogMessage[]): string | null {
  if (!member.live_handle) {
    return null
  }
  const message = log.find(
    (entry) => entry.from_handle === member.live_handle || entry.to_handle === member.live_handle
  )
  return message ? message.subject || message.body.slice(0, 160) : null
}

/** Every standing agent as a card; temps live in their own section. */
export function TeamAgentsTab({
  snapshot,
  attention,
  log,
  pendingActions,
  onOpenMember,
  onAction,
  onEdit,
  onRemove,
  onAddMember
}: {
  snapshot: TeamSnapshot
  attention: TeamAttention
  log: readonly TeamLogMessage[]
  pendingActions: readonly string[]
  onOpenMember: (memberId: string) => void
  onAction: (member: TeamMember, action: TeamMemberAction) => void
  onEdit: (member: TeamMember) => void
  onRemove: (member: TeamMember) => void
  onAddMember: () => void
}): React.JSX.Element {
  const members = snapshot.members.filter((member) => !isTeamTemp(member))
  const live = members.filter((member) => teamMemberLiveness(member) !== 'stopped').length
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="bureau-display text-bureau-ink-soft">
          {translate('team.agents.live', '{{count}} live · {{total}} on the floor', {
            count: live,
            total: members.length
          })}
        </span>
        <Button size="sm" variant="secondary" onClick={onAddMember}>
          <Plus />
          {translate('team.page.addMember', 'Add member')}
        </Button>
      </div>
      {members.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {translate('team.page.noMembers', 'Add a manager and a few members to get started.')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 @2xl/team-dock:grid-cols-2">
          {members.map((member) => (
            <TeamAgentCard
              key={member.id}
              member={member}
              task={teamMemberCurrentTask(member, snapshot.tasks)}
              tickets={teamMemberOwnedTasks(member, snapshot.tasks, snapshot.members).filter(
                (task) => !teamTaskSettled(task)
              )}
              needsYou={attention.memberIds.has(member.id)}
              snippet={latestSnippet(member, log)}
              busy={pendingActions.includes(member.id)}
              onOpenRoom={onOpenMember}
              onAction={onAction}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
