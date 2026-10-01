import { describe, expect, it } from 'vitest'
import type { FloorPlace } from './office-choreography-state'
import { samePoint, segmentCrossesRect, segmentLength } from './office-floor-geometry'
import { floorNavigation } from './office-floor-navigation'
import { floorAnchor, officeFloorPlan, type FloorVariant } from './office-floor-plan'
import { seatAnchor, seatRoster } from './office-floor-seating'
import { placePoint, placeStance, walkRoute, type FloorStage } from './office-floor-walk-route'

const ROSTER = [
  { id: 'lead', role_slug: 'manager', is_manager: 1 },
  { id: 'ada', role_slug: 'engineer', is_manager: 0 },
  { id: 'bo', role_slug: 'engineer', is_manager: 0 },
  { id: 'cy', role_slug: 'engineer', is_manager: 0 },
  { id: 'di', role_slug: 'qa', is_manager: 0 }
]

function stageFor(variant: FloorVariant): FloorStage {
  const seating = seatRoster(ROSTER)
  return { plan: officeFloorPlan(variant, seating.pods.length), seating }
}

const home = (memberId: string): FloorPlace => ({ kind: 'home', memberId })
const beside = (memberId: string): FloorPlace => ({ kind: 'beside', memberId })
const WHITEBOARD: FloorPlace = { kind: 'spot', anchor: 'whiteboard' }

function seatOf(stage: FloorStage, memberId: string): ReturnType<typeof floorAnchor> {
  const seat = stage.seating.seats.get(memberId)
  return seat ? floorAnchor(stage.plan, seatAnchor(seat)) : undefined
}

describe('floor walk routes', () => {
  it('puts a member at their own chair, and a visitor in the aisle beside it', () => {
    const stage = stageFor('wide')
    const anchor = seatOf(stage, 'ada')
    expect(placePoint(stage, home('ada'))).toEqual(anchor?.point)
    expect(placePoint(stage, beside('ada'))).toEqual(anchor?.approach)
    expect(placePoint(stage, beside('ada'))).not.toEqual(anchor?.point)
    expect(placePoint(stage, home('nobody'))).toBeNull()
  })

  it('sits at a chair and stands everywhere else', () => {
    const stage = stageFor('wide')
    expect(placeStance(stage, { kind: 'spot', anchor: 'conference:0' })).toEqual({
      seated: true,
      facing: 'viewer'
    })
    expect(placeStance(stage, { kind: 'spot', anchor: 'conference:5' })).toEqual({
      seated: true,
      facing: 'away'
    })
    expect(placeStance(stage, WHITEBOARD).seated).toBe(false)
    expect(placeStance(stage, beside('ada')).seated).toBe(false)
  })

  it('walks the plan’s own route between anchors', () => {
    const stage = stageFor('wide')
    const seat = stage.seating.seats.get('ada')
    expect(walkRoute(stage, home('ada'), WHITEBOARD)).toBe(
      floorNavigation(stage.plan).routeBetween(seat ? seatAnchor(seat) : 'manager', 'whiteboard')
    )
    expect(walkRoute(stage, home('nobody'), WHITEBOARD)).toBeNull()
  })

  it('stops a visit in the aisle, short of the chair, and starts the way back from there', () => {
    for (const variant of ['narrow', 'medium', 'wide'] as const) {
      const stage = stageFor(variant)
      for (const visitor of ROSTER) {
        for (const host of ROSTER.filter(({ id }) => id !== visitor.id)) {
          const there = walkRoute(stage, home(visitor.id), beside(host.id))
          const back = walkRoute(stage, beside(host.id), home(visitor.id))
          const full = walkRoute(stage, home(visitor.id), home(host.id))
          const aisle = seatOf(stage, host.id)?.approach
          if (!there || !back || !full || !aisle) {
            throw new Error(`no walk from ${visitor.id} to ${host.id} on the ${variant} floor`)
          }
          expect(samePoint(there.points.at(-1) ?? aisle, aisle)).toBe(true)
          expect(samePoint(there.points[0], full.points[0])).toBe(true)
          expect(there.length).toBeLessThan(full.length)
          expect(there.length).toBe(
            there.points
              .slice(1)
              .reduce((sum, to, index) => sum + segmentLength({ from: there.points[index], to }), 0)
          )
          expect(back.points).toEqual(there.points.toReversed())
        }
      }
    }
  })

  it('goes from one desk’s aisle to another’s without touching either chair or any desk', () => {
    const stage = stageFor('wide')
    const route = walkRoute(stage, beside('ada'), beside('di'))
    const desks = [stage.plan.managerDesk, ...stage.plan.pods.flatMap((pod) => pod.desks)]
    expect(route?.points[0]).toEqual(seatOf(stage, 'ada')?.approach)
    expect(route?.points.at(-1)).toEqual(seatOf(stage, 'di')?.approach)
    const legs = (route?.points ?? []).slice(1).map((to, index) => ({
      from: route?.points[index] ?? to,
      to
    }))
    expect(legs.some((leg) => desks.some((desk) => segmentCrossesRect(leg, desk.top)))).toBe(false)
  })
})
