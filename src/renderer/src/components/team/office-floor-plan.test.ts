import { describe, expect, it } from 'vitest'
import {
  pointOnSegment,
  rectContainsPoint,
  rectContainsRect,
  rectsOverlap,
  segmentCrossesRect,
  type FloorRect
} from './office-floor-geometry'
import {
  BACK_WALL,
  FLOOR_NARROW_BELOW,
  FLOOR_VARIANT_HYSTERESIS,
  FLOOR_WIDE_ABOVE,
  POD_SEATS,
  SEAT_DROP,
  floorAnchor,
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

  it('seats a pod as two rows that face each other across one desk block', () => {
    eachPlan((plan, label) => {
      for (const pod of plan.pods) {
        const [backLeft, backRight, frontLeft, frontRight] = pod.desks
        expect(pod.desks, label).toHaveLength(POD_SEATS)
        expect(
          pod.desks.map((desk) => desk.facing),
          label
        ).toEqual(['viewer', 'viewer', 'away', 'away'])
        expect([frontLeft.seat.x, frontRight.seat.x], label).toEqual([
          backLeft.seat.x,
          backRight.seat.x
        ])
        // The two rows' desks meet with no floor between them: that is the shared block.
        expect(frontLeft.top.y, label).toBe(backLeft.top.y + backLeft.top.h)
        expect(backRight.top.x, label).toBe(backLeft.top.x + backLeft.top.w)
      }
    })
  })

  it('puts every desk in its cell, with the seat against it on the side it faces from', () => {
    eachPlan((plan, label) => {
      for (const desk of [plan.managerDesk, ...plan.pods.flatMap((pod) => pod.desks)]) {
        const name = `${label}: ${desk.anchor}`
        expect(rectContainsRect(desk.cell, desk.top), name).toBe(true)
        expect(rectContainsPoint(desk.cell, desk.seat), name).toBe(true)
        expect(desk.seat.x, name).toBe(desk.top.x + desk.top.w / 2)
        if (desk.facing === 'viewer') {
          expect(desk.seat.y, name).toBe(desk.top.y)
          // Clear of the desk: over the occupant's head, or under the desk's front.
          expect(
            desk.nameplate.above
              ? desk.nameplate.at.y < desk.seat.y
              : desk.nameplate.at.y >= desk.top.y + desk.top.h,
            name
          ).toBe(true)
        } else {
          expect(desk.seat.y, name).toBe(desk.top.y + desk.top.h + SEAT_DROP)
          expect(desk.nameplate.above, name).toBe(false)
          expect(desk.nameplate.at.y, name).toBeGreaterThan(desk.seat.y)
        }
        const anchor = floorAnchor(plan, desk.anchor)
        expect(anchor?.point, name).toEqual(desk.seat)
        expect(anchor?.facing, name).toBe(desk.facing)
      }
    })
  })

  it('reserves the slots no pod has taken, where the next pods will go', () => {
    eachPlan((plan, label) => {
      const rows = Math.ceil(plan.pods.length / plan.podColumns)
      expect(plan.vacantSlots, label).toHaveLength(rows * plan.podColumns - plan.pods.length)
      const next = officeFloorPlan(plan.variant, plan.pods.length + plan.vacantSlots.length)
      expect(
        plan.vacantSlots.map(({ room, rect }) => ({ room, rect })),
        label
      ).toEqual(next.pods.slice(plan.pods.length).map(({ room, rect }) => ({ room, rect })))
      for (const slot of plan.vacantSlots) {
        for (const aisle of plan.aisles) {
          expect(segmentCrossesRect(aisle, slot.rect), label).toBe(false)
        }
      }
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

  it('keeps the staging area in the warehouse, off its lane and clear of the racks and doors', () => {
    eachPlan((plan, label) => {
      const warehouse = floorRoom(plan, 'warehouse')
      const { staging, shelf, dock } = plan.fixtures
      expect(warehouse && rectContainsRect(warehouse.rect, staging), label).toBe(true)
      expect(warehouse && rectContainsRect(warehouse.rect, shelf), label).toBe(true)
      expect(rectsOverlap(staging, shelf), label).toBe(false)
      // Wide enough for a row of boxes, and not in front of the dock door.
      expect(staging.w, label).toBeGreaterThanOrEqual(72)
      expect(staging.x + staging.w, label).toBeLessThanOrEqual(dock.x)
      for (const aisle of plan.aisles) {
        expect(segmentCrossesRect(aisle, staging), label).toBe(false)
        expect(segmentCrossesRect(aisle, shelf), label).toBe(false)
      }
      for (const door of warehouse?.doors ?? []) {
        expect(rectsOverlap(grown(door.rect, 2), shelf), `${label}: ${door.id}`).toBe(false)
      }
    })
  })

  it('puts the sign and the note tray on the reception desk, and the whiteboard on the back wall', () => {
    eachPlan((plan, label) => {
      const { receptionDesk, sign, noteTray, whiteboard } = plan.fixtures
      expect(rectContainsRect(receptionDesk, sign), label).toBe(true)
      expect(rectContainsRect(receptionDesk, noteTray), label).toBe(true)
      expect(rectsOverlap(sign, noteTray), label).toBe(false)
      expect(whiteboard.y + whiteboard.h, label).toBeLessThanOrEqual(BACK_WALL)
      const conference = floorRoom(plan, 'conference')?.rect
      expect(
        conference &&
          whiteboard.x >= conference.x &&
          whiteboard.x + whiteboard.w <= conference.x + conference.w,
        label
      ).toBe(true)
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
