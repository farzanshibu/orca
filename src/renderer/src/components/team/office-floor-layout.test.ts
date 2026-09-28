import { describe, expect, it } from 'vitest'
import {
  MANAGER_OFFICE,
  breakStations,
  deskFor,
  floorActivity,
  floorHeight,
  positionFor,
  spriteVariant
} from './office-floor-layout'

describe('office floor layout', () => {
  it('gives the manager the corner office and fills desks in rows of four', () => {
    expect(deskFor(0, true)).toEqual(MANAGER_OFFICE)
    expect(deskFor(0, false)).toEqual({ x: 130, y: 160 })
    expect(deskFor(4, false)).toEqual({ x: 130, y: 320 })
  })

  it('maps live status to where the sprite stands', () => {
    expect(floorActivity('live', 'working', false)).toBe('working')
    expect(floorActivity('live', 'permission', false)).toBe('waiting')
    expect(floorActivity('live', 'idle', false)).toBe('idle')
    expect(floorActivity('live', 'working', true)).toBe('off')
    expect(floorActivity('unverifiable', 'working', false)).toBe('off')
    const desk = { x: 300, y: 100 }
    const stations = breakStations(540)
    expect(positionFor(desk, 'working', 0, stations)).toEqual({ x: 300, y: 76 })
    expect(positionFor(desk, 'idle', 0, stations).y).toBeGreaterThan(400)
  })

  it('spreads idle members so none share a spot', () => {
    const stations = breakStations(540)
    const desk = { x: 0, y: 0 }
    const spots = [0, 1, 2, 3, 4].map((slot) => positionFor(desk, 'idle', slot, stations).x)
    expect(new Set(spots).size).toBe(5)
  })

  it('grows the floor for more than one row of desks', () => {
    expect(floorHeight(0)).toBe(540)
    expect(floorHeight(12)).toBeGreaterThan(540)
  })

  it('keeps sprite variants stable per member', () => {
    expect(spriteVariant('jim', 4)).toBe(spriteVariant('jim', 4))
    expect(spriteVariant('jim', 4)).toBeLessThan(4)
  })
})
