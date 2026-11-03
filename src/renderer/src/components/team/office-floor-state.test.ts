import { describe, expect, it } from 'vitest'
import { floorActivity, floorDotState, memberInitials, summarizeFloor } from './office-floor-state'

describe('office floor state', () => {
  it('maps live status to floor activity', () => {
    expect(floorActivity('live', 'working', false)).toBe('working')
    expect(floorActivity('live', 'permission', false)).toBe('waiting')
    expect(floorActivity('live', 'blocked', false)).toBe('waiting')
    expect(floorActivity('live', 'idle', false)).toBe('idle')
    expect(floorActivity('live', 'working', true)).toBe('off')
    expect(floorActivity('unverifiable', 'working', false)).toBe('off')
  })

  it('never claims a state it has no evidence for', () => {
    expect(floorDotState('waiting', 'live')).toBe('permission')
    expect(floorDotState('off', 'unverifiable')).toBe('unverifiable')
    expect(floorDotState('off', 'stopped')).toBe('idle')
  })

  it('derives initials from display names', () => {
    expect(memberInitials('Backend engineer')).toBe('BE')
    expect(memberInitials('qa')).toBe('QA')
    expect(memberInitials('docs-writer')).toBe('DW')
    expect(memberInitials('  ')).toBe('?')
  })

  it('counts members per activity', () => {
    expect(summarizeFloor(['working', 'working', 'idle', 'off'])).toEqual({
      working: 2,
      waiting: 0,
      idle: 1,
      off: 1
    })
  })
})
