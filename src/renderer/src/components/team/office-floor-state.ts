import type { AgentDotState } from '@/components/AgentStateDot'
import type { TeamMemberLiveness } from './team-member-liveness'

/**
 * Where a member is on the floor, from what it is doing. `unverifiable` is a member meant to be
 * running whose terminal Orca cannot find: it stays at its desk, because that is not `off`.
 */
export type FloorActivity = 'working' | 'idle' | 'waiting' | 'unverifiable' | 'off'

export function floorActivity(member: {
  liveness: TeamMemberLiveness
  agentStatus: string | null
  paused: boolean
  /** From `collectTeamAttention`, so the floor's "?" and the Inbox count share one source. */
  needsYou: boolean
}): FloorActivity {
  if (member.paused || member.liveness === 'stopped') {
    return 'off'
  }
  if (member.liveness === 'unverifiable') {
    return 'unverifiable'
  }
  if (member.needsYou) {
    return 'waiting'
  }
  return member.agentStatus === 'working' ? 'working' : 'idle'
}

/** Maps onto the shared agent-state glyph so the floor speaks the sidebar's vocabulary. */
export function floorDotState(activity: FloorActivity): AgentDotState {
  switch (activity) {
    case 'working':
      return 'working'
    case 'waiting':
      return 'permission'
    case 'unverifiable':
      return 'unverifiable'
    case 'idle':
    case 'off':
      return 'idle'
  }
}

export function memberInitials(displayName: string): string {
  const words = displayName
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
  if (words.length === 0) {
    return '?'
  }
  const letters = words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`
  return letters.toUpperCase()
}

/** Members per desk state. Who needs the human is not counted here: that number is the attention count. */
export type FloorSummary = {
  working: number
  idle: number
  unverifiable: number
  paused: number
  off: number
}

export function summarizeFloor(
  members: readonly { activity: FloorActivity; paused: boolean }[]
): FloorSummary {
  const summary: FloorSummary = { working: 0, idle: 0, unverifiable: 0, paused: 0, off: 0 }
  for (const { activity, paused } of members) {
    if (activity === 'off') {
      summary[paused ? 'paused' : 'off'] += 1
    } else if (activity !== 'waiting') {
      summary[activity] += 1
    }
  }
  return summary
}
