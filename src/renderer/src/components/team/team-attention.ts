import { teamMemberLiveness } from './team-member-liveness'
import {
  teamMemberForHandle,
  type TeamHireProposal,
  type TeamMember,
  type TeamPendingGate,
  type TeamPendingQuestion,
  type TeamSnapshot
} from './team-snapshot-types'
import { teamTaskOwner } from './team-task-owner'

/** One thing only the human can move forward. `memberId` is whose desk it shows on, when known. */
export type TeamAttentionItem =
  | { kind: 'question'; id: string; memberId: string | null; question: TeamPendingQuestion }
  | { kind: 'gate'; id: string; memberId: string | null; gate: TeamPendingGate }
  | { kind: 'hire'; id: string; memberId: string | null; hire: TeamHireProposal }
  | { kind: 'permission'; id: string; memberId: string; member: TeamMember }

export type TeamAttention = {
  /** Questions, then gates, then hires, then permission prompts, each in host order. */
  items: readonly TeamAttentionItem[]
  /** The number every "waiting on you" count shows. */
  count: number
  /** Members with at least one item: the floor's "?" markers. */
  memberIds: ReadonlySet<string>
}

export type TeamAttentionSource = Pick<
  TeamSnapshot,
  'members' | 'tasks' | 'pendingQuestions' | 'pendingGates' | 'pendingHires'
>

export const NO_TEAM_ATTENTION: TeamAttention = { items: [], count: 0, memberIds: new Set() }

/** A running member stopped at a prompt only the human can answer. A paused one is parked, not asking. */
export function teamMemberAwaitsPermission(
  member: Pick<
    TeamMember,
    'liveness' | 'live_handle' | 'desired_state' | 'paused_at' | 'agent_status'
  >
): boolean {
  return (
    teamMemberLiveness(member) === 'live' &&
    !member.paused_at &&
    (member.agent_status === 'permission' || member.agent_status === 'blocked')
  )
}

function rosterId(members: readonly TeamMember[], id: string | null | undefined): string | null {
  return id && members.some((member) => member.id === id) ? id : null
}

/**
 * Everything waiting on the human, from one snapshot. The Inbox count, the floor's "?" markers and
 * the summary line all read this, so they cannot disagree.
 */
export function collectTeamAttention(source: TeamAttentionSource): TeamAttention {
  const { members, tasks } = source
  const items: TeamAttentionItem[] = []
  for (const question of source.pendingQuestions) {
    items.push({
      kind: 'question',
      id: `question:${question.message_id}`,
      memberId:
        rosterId(members, question.asker_member_id) ??
        teamMemberForHandle(members, question.asker_handle)?.id ??
        null,
      question
    })
  }
  for (const gate of source.pendingGates) {
    const task = tasks.find((candidate) => candidate.id === gate.task_id)
    items.push({
      kind: 'gate',
      id: `gate:${gate.id}`,
      memberId:
        rosterId(members, gate.member_id) ??
        (task ? teamTaskOwner(task, members)?.id : null) ??
        null,
      gate
    })
  }
  for (const hire of source.pendingHires) {
    items.push({
      kind: 'hire',
      id: `hire:${hire.id}`,
      memberId: rosterId(members, hire.proposed_by_member_id),
      hire
    })
  }
  for (const member of members) {
    if (teamMemberAwaitsPermission(member)) {
      items.push({ kind: 'permission', id: `permission:${member.id}`, memberId: member.id, member })
    }
  }
  const memberIds = new Set<string>()
  for (const item of items) {
    if (item.memberId) {
      memberIds.add(item.memberId)
    }
  }
  return { items, count: items.length, memberIds }
}
