import { describe, expect, it } from 'vitest'
import { teamMemberLiveness } from './team-member-liveness'

function member(liveness: string, liveHandle: string | null, desiredState: string) {
  return { liveness, live_handle: liveHandle, desired_state: desiredState }
}

describe('teamMemberLiveness', () => {
  it('keeps the host verdict for each value it knows', () => {
    expect(teamMemberLiveness(member('live', 'term_1', 'running'))).toBe('live')
    expect(teamMemberLiveness(member('unverifiable', null, 'running'))).toBe('unverifiable')
    expect(teamMemberLiveness(member('stopped', null, 'stopped'))).toBe('stopped')
  })

  it('derives the verdict from the fields when the host value is unknown', () => {
    expect(teamMemberLiveness(member('reattaching', 'term_1', 'running'))).toBe('live')
    expect(teamMemberLiveness(member('reattaching', null, 'running'))).toBe('unverifiable')
    expect(teamMemberLiveness(member('reattaching', null, 'stopped'))).toBe('stopped')
  })

  it('never reads a missing terminal as stopped without the host saying so', () => {
    expect(teamMemberLiveness(member('', null, 'draining'))).toBe('unverifiable')
    expect(teamMemberLiveness(member('', null, ''))).toBe('unverifiable')
  })
})
