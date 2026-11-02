import React from 'react'
import { translate } from '@/i18n/i18n'
import { teamMemberAwaitsPermission } from './team-attention'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamMember } from './team-snapshot-types'

export type TeamMemberStatusTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted' | 'accent'

export type TeamMemberStatus = {
  kind: 'working' | 'thinking' | 'needsYou' | 'paused' | 'done' | 'idle' | 'unverifiable'
  label: string
  tone: TeamMemberStatusTone
}

/** One vocabulary for the sidebar dots, agent cards and the agent sheet. */
export function teamMemberStatus(member: TeamMember, needsYou = false): TeamMemberStatus {
  if (member.paused_at) {
    return { kind: 'paused', label: translate('team.statusChip.paused', 'Paused'), tone: 'danger' }
  }
  if (needsYou || teamMemberAwaitsPermission(member)) {
    return {
      kind: 'needsYou',
      label: translate('team.statusChip.needsYou', 'Needs you'),
      tone: 'warn'
    }
  }
  const liveness = teamMemberLiveness(member)
  if (liveness === 'unverifiable') {
    return {
      kind: 'unverifiable',
      label: translate('team.statusChip.unverifiable', 'No recent update'),
      tone: 'warn'
    }
  }
  if (liveness === 'stopped') {
    return { kind: 'idle', label: translate('team.statusChip.idle', 'Idle'), tone: 'muted' }
  }
  if (member.agent_status === 'working') {
    return { kind: 'working', label: translate('team.statusChip.working', 'Working'), tone: 'ok' }
  }
  if (member.agent_status === 'thinking') {
    return {
      kind: 'thinking',
      label: translate('team.statusChip.thinking', 'Thinking'),
      tone: 'info'
    }
  }
  if (member.agent_status === 'done' || member.agent_status === 'completed') {
    return { kind: 'done', label: translate('team.statusChip.done', 'Done'), tone: 'ok' }
  }
  return { kind: 'idle', label: translate('team.statusChip.idle', 'Idle'), tone: 'muted' }
}

export function TeamMemberStatusChip({ status }: { status: TeamMemberStatus }): React.JSX.Element {
  return (
    <span className="bureau-chip" data-tone={status.tone}>
      {status.label}
    </span>
  )
}
