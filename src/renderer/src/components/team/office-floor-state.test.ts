import { describe, expect, it } from 'vitest'
import {
  floorActivity,
  floorDotState,
  memberInitials,
  summarizeFloor,
  type FloorActivity
} from './office-floor-state'
import type { TeamMemberLiveness } from './team-member-liveness'

function activityOf(
  liveness: TeamMemberLiveness,
  agentStatus: string | null,
  flags: { paused?: boolean; needsYou?: boolean } = {}
): FloorActivity {
  return floorActivity({
    liveness,
    agentStatus,
    paused: flags.paused ?? false,
    needsYou: flags.needsYou ?? false
  })
}

describe('office floor state', () => {
  it('maps a running member to what it is doing', () => {
    expect(activityOf('live', 'working')).toBe('working')
    expect(activityOf('live', 'idle')).toBe('idle')
    expect(activityOf('live', null)).toBe('idle')
    expect(activityOf('live', 'working', { needsYou: true })).toBe('waiting')
    expect(activityOf('live', 'idle', { needsYou: true })).toBe('waiting')
  })

  it('keeps a member with no recent update at its desk, never off', () => {
    expect(activityOf('unverifiable', null)).toBe('unverifiable')
    expect(activityOf('unverifiable', 'working')).toBe('unverifiable')
    expect(activityOf('unverifiable', null, { needsYou: true })).toBe('unverifiable')
  })

  it('takes a paused or stopped member off the floor', () => {
    expect(activityOf('stopped', null)).toBe('off')
    expect(activityOf('live', 'working', { paused: true })).toBe('off')
    expect(activityOf('unverifiable', null, { paused: true })).toBe('off')
  })

  it('never claims a state it has no evidence for', () => {
    expect(floorDotState('waiting')).toBe('permission')
    expect(floorDotState('unverifiable')).toBe('unverifiable')
    expect(floorDotState('off')).toBe('idle')
  })

  it('derives initials from display names', () => {
    expect(memberInitials('Backend engineer')).toBe('BE')
    expect(memberInitials('qa')).toBe('QA')
    expect(memberInitials('docs-writer')).toBe('DW')
    expect(memberInitials('  ')).toBe('?')
  })

  it('counts members per desk state, keeping no-recent-update apart from off', () => {
    expect(
      summarizeFloor([
        { activity: 'working', paused: false },
        { activity: 'working', paused: false },
        { activity: 'idle', paused: false },
        { activity: 'waiting', paused: false },
        { activity: 'unverifiable', paused: false },
        { activity: 'off', paused: true },
        { activity: 'off', paused: false }
      ])
    ).toEqual({ working: 2, idle: 1, unverifiable: 1, paused: 1, off: 1 })
  })
})
