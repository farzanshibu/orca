import { describe, expect, it } from 'vitest'
import {
  pointOnSegment,
  rectContainsPoint,
  rectContainsRect,
  rectsOverlap,
  type FloorRect
} from './office-floor-geometry'
import {
  FLOOR_NARROW_BELOW,
  FLOOR_VARIANT_HYSTERESIS,
  FLOOR_WIDE_ABOVE,
  floorRoom,
  floorVariant,
  officeFloorPlan,
  type FloorVariant,
  type OfficeFloorPlan
} from './office-floor-plan'

const VARIANTS: readonly FloorVariant[] = ['narrow', 'medium', 'wide']
const POD_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function eachPlan(check: (plan: OfficeFloorPlan, label: string) => void): void {
  for (const variant of VARIANTS) {
    for (const pods of POD_COUNTS) {
      check(officeFloorPlan(variant, pods), `${variant} with ${pods} pod(s)`)
    }
  }
}

function grown(rect: FloorRect, by: number): FloorRect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 }
}

describe('office floor plan', () => {
  it('keeps rooms apart and inside the building in every variant', () => {
    eachPlan((plan, label) => {
      const floor = { x: 0, y: 0, w: plan.width, h: plan.height }
      plan.rooms.forEach((room, index) => {
        expect(rectContainsRect(floor, room.rect), `${label}: ${room.id}`).toBe(true)
        for (const other of plan.rooms.slice(index + 1)) {
          expect(rectsOverlap(room.rect, other.rect), `${label}: ${room.id}/${other.id}`).toBe(
            false
          )
        }
        for (const wall of plan.walls) {
          expect(rectsOverlap(room.rect, wall.rect), `${label}: wall in ${room.id}`).toBe(false)
        }
      })
    })
  })

  it('has every room in every variant, and the annex only on wide floors', () => {
    eachPlan((plan, label) => {
      const ids = plan.rooms.map((room) => room.id).sort()
      const expected = ['bullpen', 'conference', 'kitchen', 'manager', 'reception', 'warehouse']
      expect(ids, label).toEqual(plan.variant === 'wide' ? ['annex', ...expected] : expected)
    })
  })

  it('puts each door in a wall between the two rooms it joins', () => {
    eachPlan((plan, label) => {
      for (const door of plan.doors) {
        for (const id of door.rooms) {
          const room = floorRoom(plan, id)
          expect(room?.doors, `${label}: ${door.id}`).toContain(door)
          expect(room && rectsOverlap(grown(door.rect, 1), room.rect), `${label}: ${door.id}`).toBe(
            true
          )
          expect(room && rectsOverlap(door.rect, room.rect), `${label}: ${door.id}`).toBe(false)
        }
        for (const wall of plan.walls) {
          expect(rectsOverlap(door.rect, wall.rect), `${label}: ${door.id}`).toBe(false)
        }
      }
    })
  })

  it('keeps pods inside their room, apart, and clear of the fixtures', () => {
    eachPlan((plan, label) => {
      plan.pods.forEach((pod, index) => {
        expect(pod.index, label).toBe(index)
        const room = floorRoom(plan, pod.room)
        expect(room && rectContainsRect(room.rect, pod.rect), `${label}: pod ${index}`).toBe(true)
        for (const other of plan.pods.slice(index + 1)) {
          expect(rectsOverlap(pod.rect, other.rect), `${label}: pod ${index}`).toBe(false)
        }
        for (const desk of pod.desks) {
          expect(rectContainsRect(pod.rect, desk.cell), `${label}: ${desk.anchor}`).toBe(true)
        }
        for (const fixture of Object.values(plan.fixtures)) {
          expect(rectsOverlap(pod.rect, fixture), `${label}: pod ${index}`).toBe(false)
        }
      })
    })
  })

  it('never moves an existing pod when pods are added, and only grows downward', () => {
    for (const variant of VARIANTS) {
      for (const pods of POD_COUNTS) {
        const before = officeFloorPlan(variant, pods)
        const after = officeFloorPlan(variant, pods + 1)
        expect(after.pods.slice(0, pods)).toEqual(before.pods)
        expect(after.width).toBe(before.width)
        expect(after.height).toBeGreaterThanOrEqual(before.height)
        for (const id of ['manager', 'conference', 'kitchen'] as const) {
          expect(floorRoom(after, id)?.rect).toEqual(floorRoom(before, id)?.rect)
        }
        expect(after.managerDesk).toEqual(before.managerDesk)
      }
    }
  })

  it('reserves a whole row of pod slots at a time', () => {
    expect(officeFloorPlan('wide', 3).height).toBe(officeFloorPlan('wide', 1).height)
    expect(officeFloorPlan('wide', 4).height).toBeGreaterThan(officeFloorPlan('wide', 3).height)
    expect(officeFloorPlan('wide', 3).pods[2].room).toBe('annex')
    expect(officeFloorPlan('medium', 3).height).toBeGreaterThan(officeFloorPlan('medium', 2).height)
    expect(officeFloorPlan('narrow', 2).height).toBeGreaterThan(officeFloorPlan('narrow', 1).height)
  })

  it('always has at least one pod', () => {
    expect(officeFloorPlan('wide', 0).pods).toHaveLength(1)
    expect(officeFloorPlan('wide', 0)).toBe(officeFloorPlan('wide', 1))
  })

  it('names every anchor once, inside its room, with an approach on an aisle', () => {
    eachPlan((plan, label) => {
      const ids = plan.anchors.map((anchor) => anchor.id)
      expect(new Set(ids).size, label).toBe(ids.length)
      expect(ids, label).toEqual(
        expect.arrayContaining([
          'manager',
          'whiteboard',
          'reception',
          'entrance',
          'dock',
          'conference:0',
          'conference:7',
          'kitchen:0',
          ...plan.pods.flatMap((pod) => pod.desks.map((desk) => desk.anchor))
        ])
      )
      for (const anchor of plan.anchors) {
        const room = floorRoom(plan, anchor.room)
        expect(room && rectContainsPoint(room.rect, anchor.point), `${label}: ${anchor.id}`).toBe(
          true
        )
        expect(
          plan.aisles.some((aisle) => pointOnSegment(anchor.approach, aisle)),
          `${label}: ${anchor.id}`
        ).toBe(true)
        expect(
          anchor.point.x === anchor.approach.x || anchor.point.y === anchor.approach.y,
          `${label}: ${anchor.id}`
        ).toBe(true)
      }
    })
  })

  it('keeps fixtures inside the building', () => {
    eachPlan((plan, label) => {
      const floor = { x: 0, y: 0, w: plan.width, h: plan.height }
      for (const [name, rect] of Object.entries(plan.fixtures)) {
        expect(rectContainsRect(floor, rect), `${label}: ${name}`).toBe(true)
        expect(rect.w > 0 && rect.h > 0, `${label}: ${name}`).toBe(true)
      }
    })
  })
})

describe('office floor variant', () => {
  it('picks a variant from the width alone the first time', () => {
    expect(floorVariant(FLOOR_NARROW_BELOW - 1, null)).toBe('narrow')
    expect(floorVariant(FLOOR_NARROW_BELOW, null)).toBe('medium')
    expect(floorVariant(FLOOR_WIDE_ABOVE, null)).toBe('medium')
    expect(floorVariant(FLOOR_WIDE_ABOVE + 1, null)).toBe('wide')
  })

  it('holds the current variant until the width is well past the narrow boundary', () => {
    const edge = FLOOR_NARROW_BELOW
    expect(floorVariant(edge + FLOOR_VARIANT_HYSTERESIS - 1, 'narrow')).toBe('narrow')
    expect(floorVariant(edge + FLOOR_VARIANT_HYSTERESIS, 'narrow')).toBe('medium')
    expect(floorVariant(edge - FLOOR_VARIANT_HYSTERESIS, 'medium')).toBe('medium')
    expect(floorVariant(edge - FLOOR_VARIANT_HYSTERESIS - 1, 'medium')).toBe('narrow')
  })

  it('holds the current variant until the width is well past the wide boundary', () => {
    const edge = FLOOR_WIDE_ABOVE
    expect(floorVariant(edge + FLOOR_VARIANT_HYSTERESIS, 'medium')).toBe('medium')
    expect(floorVariant(edge + FLOOR_VARIANT_HYSTERESIS + 1, 'medium')).toBe('wide')
    expect(floorVariant(edge - FLOOR_VARIANT_HYSTERESIS + 1, 'wide')).toBe('wide')
    expect(floorVariant(edge - FLOOR_VARIANT_HYSTERESIS, 'wide')).toBe('medium')
  })

  it('does not flap while the width wobbles around a boundary', () => {
    for (const edge of [FLOOR_NARROW_BELOW, FLOOR_WIDE_ABOVE]) {
      for (const start of VARIANTS) {
        let variant = floorVariant(edge - 20, start)
        const settled = variant
        for (const width of [edge + 20, edge - 20, edge + 5, edge - 5, edge + 20]) {
          variant = floorVariant(width, variant)
          expect(variant).toBe(settled)
        }
      }
    }
  })

  it('still crosses two boundaries in one resize', () => {
    expect(floorVariant(1600, 'narrow')).toBe('wide')
    expect(floorVariant(320, 'wide')).toBe('narrow')
  })
})
