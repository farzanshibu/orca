import { beforeEach, describe, expect, it } from 'vitest'
import {
  TEAM_TURN_GRACE_MS,
  TeamMemberTurnLedger,
  type TeamTurnKind
} from './team-member-turn-ledger'

describe('TeamMemberTurnLedger', () => {
  let now: number
  let queued: TeamTurnKind | null
  let ledger: TeamMemberTurnLedger

  function granted(kind: TeamTurnKind, memberId = 'jim') {
    const decision = ledger.claim(memberId, kind)
    if (!decision.granted) {
      throw new Error(`expected the ${kind} claim to be granted, got ${decision.reason}`)
    }
    return decision.claim
  }

  beforeEach(() => {
    now = 1_000_000
    queued = null
    ledger = new TeamMemberTurnLedger({ queuedKind: () => queued, now: () => now })
  })

  it('gives the turn to closing, then the queue, then an assignment', () => {
    queued = 'closing'
    expect(ledger.claim('jim', 'assignment')).toEqual({
      granted: false,
      reason: 'outranked',
      by: 'closing'
    })
    expect(ledger.claim('jim', 'queue')).toEqual({
      granted: false,
      reason: 'outranked',
      by: 'closing'
    })
    expect(ledger.check('jim', 'closing')).toBeNull()

    queued = 'queue'
    expect(ledger.claim('jim', 'assignment')).toEqual({
      granted: false,
      reason: 'outranked',
      by: 'queue'
    })
    expect(ledger.check('jim', 'queue')).toBeNull()

    queued = null
    expect(granted('assignment').kind).toBe('assignment')
  })

  it('allows one claim per member until it clears, and keeps members apart', () => {
    granted('queue')
    expect(ledger.claim('jim', 'queue')).toEqual({
      granted: false,
      reason: 'turn_taken',
      holder: 'queue'
    })
    // A standing claim outranks even closing: the prompt is already typed.
    queued = 'closing'
    expect(ledger.claim('jim', 'closing')).toMatchObject({ granted: false, reason: 'turn_taken' })
    expect(ledger.claim('pam', 'closing').granted).toBe(true)
  })

  it('clears a claim on a working edge', () => {
    granted('queue')
    ledger.noteWorking('jim')
    expect(ledger.holder('jim')).toBeNull()
    expect(ledger.claim('jim', 'queue').granted).toBe(true)
  })

  it('clears a claim when its send fails, and only that claim', () => {
    const stale = granted('queue')
    ledger.release(stale)
    expect(ledger.holder('jim')).toBeNull()
    const current = granted('assignment')
    // A late failure report for the released claim must not free the newer one.
    ledger.release(stale)
    expect(ledger.holder('jim')).toBe(current)
  })

  it('clears a claim once the grace runs out with no working edge', () => {
    granted('queue')
    now += TEAM_TURN_GRACE_MS - 1
    expect(ledger.claim('jim', 'queue')).toMatchObject({ granted: false, reason: 'turn_taken' })
    now += 1
    expect(ledger.holder('jim')).toBeNull()
    expect(ledger.claim('jim', 'queue').granted).toBe(true)
  })
})
