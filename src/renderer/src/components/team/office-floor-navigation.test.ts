import { describe, expect, it } from 'vitest'
import {
  samePoint,
  segmentCrossesRect,
  segmentLength,
  type FloorRect,
  type FloorSegment
} from './office-floor-geometry'
import { floorNavigation, type FloorRoute } from './office-floor-navigation'
import {
  officeFloorPlan,
  type FloorAnchor,
  type FloorVariant,
  type OfficeFloorPlan
} from './office-floor-plan'
import { sideBySidePlan } from './office-floor-plan-side-by-side'
import { stackedPlan } from './office-floor-plan-stacked'

const VARIANTS: readonly FloorVariant[] = ['narrow', 'medium', 'wide']
const POD_COUNTS = [1, 3, 6, 9]

function legs(route: FloorRoute): FloorSegment[] {
  return route.points.slice(1).map((to, index) => ({ from: route.points[index], to }))
}

/** What a walking character must not pass through: desks, the big furniture, and the staging area. */
function furniture(plan: OfficeFloorPlan): FloorRect[] {
  const desks = [plan.managerDesk, ...plan.pods.flatMap((pod) => pod.desks)]
  return [
    ...desks.map(({ top }) => top),
    plan.fixtures.conferenceTable,
    plan.fixtures.kitchenCounter,
    plan.fixtures.receptionDesk,
    plan.fixtures.shelf,
    plan.fixtures.staging
  ]
}

type Walk = { route: FloorRoute | null; from: FloorAnchor; to: FloorAnchor; label: string }

function eachPlan(check: (plan: OfficeFloorPlan, walks: Walk[]) => void): void {
  for (const variant of VARIANTS) {
    for (const pods of POD_COUNTS) {
      const plan = officeFloorPlan(variant, pods)
      const navigation = floorNavigation(plan)
      check(
        plan,
        plan.anchors.flatMap((from) =>
          plan.anchors.map((to) => ({
            route: navigation.routeBetween(from.id, to.id),
            from,
            to,
            label: `${variant}/${pods} pods: ${from.id} to ${to.id}`
          }))
        )
      )
    }
  }
}

/** Labels of the walks with a leg through any of `rects`. */
function walksThrough(walks: readonly Walk[], rects: readonly FloorRect[]): string[] {
  return walks
    .filter(({ route }) =>
      (route ? legs(route) : []).some((leg) => rects.some((rect) => segmentCrossesRect(leg, rect)))
    )
    .map(({ label }) => label)
}

describe('office floor navigation', () => {
  it('reaches every anchor from every other, for 1, 3, 6 and 9 pods', () => {
    eachPlan((_plan, walks) => {
      const unreached = walks.filter(
        ({ route, from, to }) =>
          !route ||
          !samePoint(route.points[0], from.point) ||
          !samePoint(route.points.at(-1) ?? from.point, to.point)
      )
      expect(unreached.map(({ label }) => label)).toEqual([])
    })
  })

  it('never crosses a wall', () => {
    eachPlan((plan, walks) => {
      expect(
        walksThrough(
          walks,
          plan.walls.map((wall) => wall.rect)
        )
      ).toEqual([])
    })
  })

  it('walks around desks and furniture, never through them', () => {
    eachPlan((plan, walks) => {
      expect(walksThrough(walks, furniture(plan))).toEqual([])
    })
  })

  it('only walks straight across or straight down, and measures what it walks', () => {
    eachPlan((_plan, walks) => {
      const crooked = walks.filter(({ route }) => {
        const walked = route ? legs(route) : []
        return (
          walked.some(
            (leg) => (leg.from.x !== leg.to.x && leg.from.y !== leg.to.y) || !segmentLength(leg)
          ) || route?.length !== walked.reduce((sum, leg) => sum + segmentLength(leg), 0)
        )
      })
      expect(crooked.map(({ label }) => label)).toEqual([])
    })
  })

  it('gives the same route every time, and the same one for an identical plan', () => {
    const rebuilt = {
      narrow: (pods: number) => stackedPlan(pods),
      medium: (pods: number) => sideBySidePlan('medium', pods),
      wide: (pods: number) => sideBySidePlan('wide', pods)
    }
    for (const variant of VARIANTS) {
      const plan = officeFloorPlan(variant, 6)
      const navigation = floorNavigation(plan)
      expect(floorNavigation(plan)).toBe(navigation)
      const again = floorNavigation(rebuilt[variant](6))
      for (const from of plan.anchors) {
        for (const to of plan.anchors) {
          const route = navigation.routeBetween(from.id, to.id)
          expect(navigation.routeBetween(from.id, to.id)).toBe(route)
          expect(again.routeBetween(from.id, to.id)).toEqual(route)
        }
      }
    }
  })

  it('walks back the way it came', () => {
    const plan = officeFloorPlan('wide', 6)
    const navigation = floorNavigation(plan)
    for (const from of plan.anchors) {
      for (const to of plan.anchors) {
        const there = navigation.routeBetween(from.id, to.id)
        const back = navigation.routeBetween(to.id, from.id)
        expect(back?.points).toEqual(there?.points.toReversed())
        expect(back?.length).toBe(there?.length)
      }
    }
  })

  it('stays put when asked to go nowhere', () => {
    const plan = officeFloorPlan('medium', 1)
    const manager = plan.anchors.find((anchor) => anchor.id === 'manager')
    expect(floorNavigation(plan).routeBetween('manager', 'manager')).toEqual({
      points: [manager?.point],
      length: 0
    })
  })

  it('has no route to a desk the plan does not have', () => {
    const navigation = floorNavigation(officeFloorPlan('wide', 1))
    expect(navigation.routeBetween('manager', 'seat:5:0')).toBeNull()
    expect(navigation.routeBetween('seat:5:0', 'manager')).toBeNull()
  })

  it('takes the manager to reception through the office door', () => {
    const plan = officeFloorPlan('wide', 3)
    const route = floorNavigation(plan).routeBetween('manager', 'reception')
    const door = plan.doors.find(({ id }) => id === 'manager-reception')
    expect(route && door && legs(route).some((leg) => segmentCrossesRect(leg, door.rect))).toBe(
      true
    )
  })
})
