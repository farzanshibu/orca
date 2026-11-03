import type { AgentDotState } from '@/components/AgentStateDot'

/** Where a member is on the floor, from what it is doing. */
export type FloorActivity = 'working' | 'idle' | 'waiting' | 'off'

export function floorActivity(
  liveness: string,
  agentStatus: string | null,
  paused: boolean
): FloorActivity {
  if (liveness !== 'live' || paused) {
    return 'off'
  }
  if (agentStatus === 'working') {
    return 'working'
  }
  if (agentStatus === 'permission' || agentStatus === 'blocked') {
    return 'waiting'
  }
  return 'idle'
}

/** Maps onto the shared agent-state glyph so the floor speaks the sidebar's vocabulary. */
export function floorDotState(activity: FloorActivity, liveness: string): AgentDotState {
  if (activity === 'working') {
    return 'working'
  }
  if (activity === 'waiting') {
    return 'permission'
  }
  return liveness === 'unverifiable' ? 'unverifiable' : 'idle'
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

export type FloorSummary = Record<FloorActivity, number>

export function summarizeFloor(activities: readonly FloorActivity[]): FloorSummary {
  const summary: FloorSummary = { working: 0, waiting: 0, idle: 0, off: 0 }
  for (const activity of activities) {
    summary[activity] += 1
  }
  return summary
}
