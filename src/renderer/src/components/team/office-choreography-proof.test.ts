import { afterEach, describe, expect, it } from 'vitest'
import {
  officeProof,
  officeProofSession,
  type OfficeProofSession
} from './office-choreography-proof'
import { castMember } from './office-choreography-test-fixtures'
import { createFloorDirector, type FloorDirector } from './office-floor-director'

afterEach(() => {
  officeProof.uninstall()
})

function installedSession(): OfficeProofSession {
  const session = officeProofSession()
  if (!session) {
    throw new Error('no proof is installed')
  }
  return session
}

/** A director fed the way the floor's hook feeds one while a proof is installed. */
function directorOnProof(): FloorDirector {
  const session = installedSession()
  const director = createFloorDirector()
  director.setInput({
    clock: session.clock,
    epoch: -1,
    live: session.entries,
    cast: [castMember('lead', 'idle', true), castMember('ada'), castMember('bo')],
    reducedMotion: false,
    hidden: session.hidden,
    walkMs: () => 1_000
  })
  return director
}

describe('office proof', () => {
  it('is inert until it is installed', () => {
    expect(officeProof.installed()).toBe(false)
    expect(officeProof.now()).toBeNull()
    expect(officeProof.push([{ kind: 'goal_created' }])).toBe(0)
    officeProof.advance(1_000)
    officeProof.setActivity('ada', 'working')
    officeProof.setReducedMotion(true)
    officeProof.setHidden(true)
    expect(officeProof.installed()).toBe(false)
    expect(officeProofSession()).toBeNull()
  })

  it('holds a clock that only advance moves', () => {
    officeProof.install({ now: 5_000 })
    expect(officeProof.now()).toBe(5_000)
    officeProof.advance(1_250)
    expect(officeProof.now()).toBe(6_250)
    officeProof.uninstall()
    expect(officeProof.now()).toBeNull()
  })

  it('fills in a pushed event and stamps it with the manual clock', () => {
    officeProof.install({ now: 1_000 })
    officeProof.advance(500)
    const last = officeProof.push([
      {
        kind: 'dispatch_started',
        to: { party: 'member', member_ids: ['ada'] },
        id: 'mine',
        sequence: 99
      },
      { message_type: 'handoff' }
    ])

    expect(last).toBe(2)
    const [first, second] = installedSession().entries()
    expect(first).toMatchObject({
      history: false,
      arrivedAt: 1_500,
      event: { id: 'proof_1', sequence: 1, kind: 'dispatch_started', to: { member_ids: ['ada'] } }
    })
    expect(second.event).toMatchObject({ id: 'proof_2', kind: 'message', message_type: 'handoff' })
  })

  it('keeps what a harness says about a member, a new session per change', () => {
    officeProof.install()
    const before = installedSession()
    officeProof.setActivity('ada', 'working')
    officeProof.setReducedMotion(true)
    const after = installedSession()

    expect(after).not.toBe(before)
    expect(after.clock).toBe(before.clock)
    expect(after.entries).toBe(before.entries)
    expect(after.activity.get('ada')).toBe('working')
    expect(after.reducedMotion).toBe(true)
    officeProof.setActivity('ada', null)
    expect(installedSession().activity.has('ada')).toBe(false)
  })

  it('drives a floor through pushed events and a hand-moved clock', () => {
    officeProof.install({ now: 1_000 })
    const director = directorOnProof()

    officeProof.push([
      { kind: 'dispatch_started', to: { party: 'member', member_ids: ['ada'] } },
      { kind: 'dispatch_started', to: { party: 'member', member_ids: ['bo'] } }
    ])
    expect(director.scene().meeting).toBeNull()

    officeProof.advance(1_200)
    expect(director.scene().meeting).toBe('kickoff')
    expect([...director.scene().poses.keys()]).toEqual(['lead', 'ada', 'bo'])

    officeProof.advance(1_000)
    expect(director.scene().poses.get('ada')).toMatchObject({
      kind: 'away',
      at: { kind: 'spot', anchor: 'conference:0' }
    })
    director.dispose()
  })
})
