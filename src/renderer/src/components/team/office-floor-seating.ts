import { POD_SEATS, seatAnchorId, type FloorAnchorId } from './office-floor-plan-parts'
import type { TeamMember } from './team-snapshot-types'

export type SeatedMember = Pick<TeamMember, 'id' | 'role_slug' | 'is_manager'>

/** The manager's office, or desk `desk` of pod `pod`. */
export type FloorSeat = { kind: 'manager' } | { kind: 'pod'; pod: number; desk: number }

export type SeatingPod = {
  /** The role this pod seats; null while nobody sits in it. */
  role: string | null
  /** Member id per desk, null where the desk is vacant. */
  desks: readonly (string | null)[]
}

export type FloorSeating = {
  /** Index-aligned with the plan's pods; there is always at least one. */
  pods: readonly SeatingPod[]
  seats: ReadonlyMap<string, FloorSeat>
}

function vacantPod(): { role: string | null; desks: (string | null)[] } {
  return { role: null, desks: Array.from({ length: POD_SEATS }, () => null) }
}

export const EMPTY_SEATING: FloorSeating = { pods: [vacantPod()], seats: new Map() }

export function seatAnchor(seat: FloorSeat): FloorAnchorId {
  return seat.kind === 'manager' ? 'manager' : seatAnchorId(seat.pod, seat.desk)
}

function sameSeating(a: FloorSeating, b: FloorSeating): boolean {
  return (
    a.pods.length === b.pods.length &&
    a.seats.size === b.seats.size &&
    a.pods.every(
      (pod, index) =>
        pod.role === b.pods[index].role &&
        pod.desks.every((member, desk) => member === b.pods[index].desks[desk])
    ) &&
    [...a.seats].every(([id, seat]) => {
      const other = b.seats.get(id)
      return (
        other?.kind === seat.kind &&
        (seat.kind === 'manager' ||
          (other.kind === 'pod' && other.pod === seat.pod && other.desk === seat.desk))
      )
    })
  )
}

/**
 * Seats the roster: the first manager in the office, everyone else in a pod for their role.
 *
 * Whoever already has a seat in `previous` keeps it, so adding or removing a member moves nobody
 * else; only a member whose role changed, or a manager the office has come free for, moves. A
 * newcomer takes the first vacant desk in a pod of their role, then an empty pod, then a new pod
 * at the end, so pods are only ever added after the existing ones. Seating the same roster again
 * returns `previous` itself.
 */
export function seatRoster(
  roster: readonly SeatedMember[],
  previous: FloorSeating = EMPTY_SEATING
): FloorSeating {
  const pods = previous.pods.map(() => vacantPod())
  const seats = new Map<string, FloorSeat>()
  let officeTaken = false
  for (const member of roster) {
    const seat = previous.seats.get(member.id)
    if (seat?.kind === 'manager' && member.is_manager && !officeTaken) {
      officeTaken = true
      seats.set(member.id, seat)
    } else if (seat?.kind === 'pod' && previous.pods[seat.pod]?.role === member.role_slug) {
      pods[seat.pod].role = member.role_slug
      pods[seat.pod].desks[seat.desk] = member.id
      seats.set(member.id, seat)
    }
  }
  const manager = officeTaken ? undefined : roster.find((member) => member.is_manager)
  if (manager) {
    const seat = seats.get(manager.id)
    if (seat?.kind === 'pod') {
      const pod = pods[seat.pod]
      pod.desks[seat.desk] = null
      pod.role = pod.desks.some(Boolean) ? pod.role : null
    }
    seats.set(manager.id, { kind: 'manager' })
  }
  for (const member of roster) {
    if (seats.has(member.id)) {
      continue
    }
    let pod = pods.findIndex(({ role, desks }) => role === member.role_slug && desks.includes(null))
    if (pod < 0) {
      pod = pods.findIndex(({ role }) => role === null)
    }
    if (pod < 0) {
      pod = pods.push(vacantPod()) - 1
    }
    const desk = pods[pod].desks.indexOf(null)
    pods[pod].role = member.role_slug
    pods[pod].desks[desk] = member.id
    seats.set(member.id, { kind: 'pod', pod, desk })
  }
  // Only trailing pods can go: dropping one in the middle would renumber, and so move, the rest.
  while (pods.length > 1 && pods.at(-1)?.role === null) {
    pods.pop()
  }
  const seating = { pods, seats }
  return sameSeating(seating, previous) ? previous : seating
}
