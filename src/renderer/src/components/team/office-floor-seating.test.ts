import { describe, expect, it } from 'vitest'
import { POD_SEATS } from './office-floor-plan'
import {
  EMPTY_SEATING,
  seatAnchor,
  seatRoster,
  type FloorSeating,
  type SeatedMember
} from './office-floor-seating'

function member(id: string, role: string, manager = false): SeatedMember {
  return { id, role_slug: role, is_manager: manager ? 1 : 0 }
}

const ROSTER: readonly SeatedMember[] = [
  member('lead', 'manager', true),
  member('e1', 'engineer'),
  member('q1', 'qa'),
  member('e2', 'engineer'),
  member('d1', 'docs'),
  member('e3', 'engineer'),
  member('e4', 'engineer'),
  member('e5', 'engineer'),
  member('q2', 'qa')
]

function seatsExcept(seating: FloorSeating, id: string): [string, unknown][] {
  return [...seating.seats].filter(([member]) => member !== id)
}

describe('office floor seating', () => {
  it('gives the manager the office and groups everyone else into pods by role', () => {
    const seating = seatRoster(ROSTER)
    expect(seating.seats.get('lead')).toEqual({ kind: 'manager' })
    expect(seating.pods.map((pod) => pod.role)).toEqual(['engineer', 'qa', 'docs', 'engineer'])
    const roleOf = new Map(ROSTER.map(({ id, role_slug }) => [id, role_slug]))
    for (const pod of seating.pods) {
      expect(pod.desks).toHaveLength(POD_SEATS)
      for (const id of pod.desks) {
        expect(id === null || roleOf.get(id) === pod.role).toBe(true)
      }
    }
    expect(seating.pods[0].desks).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(seating.seats.get('e5')).toEqual({ kind: 'pod', pod: 3, desk: 0 })
  })

  it('gives every member exactly one seat and every seat at most one member', () => {
    const seating = seatRoster(ROSTER)
    expect(seating.seats.size).toBe(ROSTER.length)
    const anchors = [...seating.seats.values()].map(seatAnchor)
    expect(new Set(anchors).size).toBe(anchors.length)
    expect(anchors).toContain('manager')
    expect(seatAnchor({ kind: 'pod', pod: 2, desk: 3 })).toBe('seat:2:3')
  })

  it('moves nobody else when a member is added', () => {
    let seating = EMPTY_SEATING
    const roster: SeatedMember[] = []
    for (const next of ROSTER) {
      const before = [...seating.seats]
      roster.push(next)
      seating = seatRoster(roster, seating)
      expect(seatsExcept(seating, next.id)).toEqual(before)
      expect(seating.seats.has(next.id)).toBe(true)
    }
  })

  it('moves nobody else when a member is removed', () => {
    const full = seatRoster(ROSTER)
    for (const gone of ROSTER) {
      const seating = seatRoster(
        ROSTER.filter((candidate) => candidate.id !== gone.id),
        full
      )
      expect([...seating.seats]).toEqual(seatsExcept(full, gone.id))
    }
  })

  it('leaves a vacated desk open for the next hire in that role', () => {
    const full = seatRoster(ROSTER)
    const without = seatRoster(
      ROSTER.filter(({ id }) => id !== 'e2'),
      full
    )
    expect(without.pods[0].desks).toEqual(['e1', null, 'e3', 'e4'])
    const rehired = seatRoster(
      [...ROSTER.filter(({ id }) => id !== 'e2'), member('e6', 'engineer')],
      without
    )
    expect(rehired.seats.get('e6')).toEqual({ kind: 'pod', pod: 0, desk: 1 })
  })

  it('keeps an emptied pod in place so later pods do not shift, and lets a new role take it', () => {
    const full = seatRoster(ROSTER)
    const noQa = ROSTER.filter(({ role_slug }) => role_slug !== 'qa')
    const emptied = seatRoster(noQa, full)
    expect(emptied.pods.map((pod) => pod.role)).toEqual(['engineer', null, 'docs', 'engineer'])
    const withDesigner = seatRoster([...noQa, member('x1', 'design')], emptied)
    expect(withDesigner.seats.get('x1')).toEqual({ kind: 'pod', pod: 1, desk: 0 })
    expect(seatsExcept(withDesigner, 'x1')).toEqual([...emptied.seats])
  })

  it('drops empty pods from the end, down to the one pod an empty floor shows', () => {
    const full = seatRoster(ROSTER)
    const trimmed = seatRoster(
      ROSTER.filter(({ id }) => id !== 'e5'),
      full
    )
    expect(trimmed.pods).toHaveLength(3)
    const nobody = seatRoster([], full)
    expect(nobody.pods).toEqual(EMPTY_SEATING.pods)
    expect(seatRoster([])).toBe(EMPTY_SEATING)
  })

  it('moves only the member whose role changed', () => {
    const full = seatRoster(ROSTER)
    const changed = ROSTER.map((candidate) =>
      candidate.id === 'e1' ? member('e1', 'qa') : candidate
    )
    const seating = seatRoster(changed, full)
    expect(seating.seats.get('e1')).toEqual({ kind: 'pod', pod: 1, desk: 2 })
    expect(seatsExcept(seating, 'e1')).toEqual(seatsExcept(full, 'e1'))
  })

  it('passes the office to the next manager, and seats a second manager by role', () => {
    const two = [member('lead', 'manager', true), member('deputy', 'manager', true)]
    const seating = seatRoster(two)
    expect(seating.seats.get('lead')).toEqual({ kind: 'manager' })
    expect(seating.seats.get('deputy')).toEqual({ kind: 'pod', pod: 0, desk: 0 })
    const promoted = seatRoster([two[1]], seating)
    expect(promoted.seats.get('deputy')).toEqual({ kind: 'manager' })
  })

  it('returns the same seating when nothing changed, so a repeated render is harmless', () => {
    const seating = seatRoster(ROSTER)
    expect(seatRoster(ROSTER, seating)).toBe(seating)
    expect(seatRoster(ROSTER.toReversed(), seating)).toBe(seating)
  })

  it('seats a fresh roster the same way every time', () => {
    expect(seatRoster(ROSTER)).toEqual(seatRoster(ROSTER))
  })
})
