import { describe, expect, it } from 'vitest'
import { floorColumns, floorLayout } from './office-floor-layout'

describe('office floor layout', () => {
  it('fills rows left to right and grows the floor with the headcount', () => {
    const small = floorLayout(3, 3)
    const large = floorLayout(10, 3)
    expect(small.desks.map((desk) => desk.cell.y)).toEqual([
      small.desks[0].cell.y,
      small.desks[0].cell.y,
      small.desks[0].cell.y
    ])
    expect(large.desks).toHaveLength(10)
    expect(large.height).toBeGreaterThan(small.height)
  })

  it('puts the break room beside wide floors and below narrow ones', () => {
    const wide = floorLayout(4, 4)
    const narrow = floorLayout(4, 2)
    expect(wide.breakRoomBeside).toBe(true)
    expect(wide.breakRoom.x).toBeGreaterThan(wide.desks[3].cell.x)
    expect(narrow.breakRoomBeside).toBe(false)
    const lastDesk = narrow.desks.at(-1)!.cell
    expect(narrow.breakRoom.y).toBeGreaterThan(lastDesk.y + lastDesk.h)
  })

  it('keeps every desk and idle spot inside the floor', () => {
    for (const columns of [2, 3, 4]) {
      const layout = floorLayout(9, columns)
      for (const { cell } of layout.desks) {
        expect(cell.x + cell.w).toBeLessThanOrEqual(layout.width)
        expect(cell.y + cell.h).toBeLessThanOrEqual(layout.height)
      }
      for (const spot of layout.idleSpots) {
        expect(spot.x).toBeLessThan(layout.width)
        expect(spot.y).toBeLessThan(layout.height)
      }
    }
  })

  it('picks fewer columns on narrow containers', () => {
    expect(floorColumns(360)).toBe(2)
    expect(floorColumns(900)).toBe(3)
    expect(floorColumns(1400)).toBe(4)
  })
})
