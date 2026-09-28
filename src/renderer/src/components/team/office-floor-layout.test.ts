import { describe, expect, it } from 'vitest'
import {
  MANAGER_OFFICE,
  deskFor,
  floorActivity,
  positionFor,
  spriteVariant
} from './office-floor-layout'

describe('office floor layout', () => {
  it('gives the manager the corner office and fills desks in rows of four', () => {
    expect(deskFor(0, true)).toEqual(MANAGER_OFFICE)
    expect(deskFor(0, false)).toEqual({ x: 140, y: 120 })
    expect(deskFor(4, false)).toEqual({ x: 140, y: 250 })
  })

  it('maps live status to where the sprite stands', () => {
    expect(floorActivity('live', 'working', false)).toBe('working')
    expect(floorActivity('live', 'permission', false)).toBe('waiting')
    expect(floorActivity('live', 'idle', false)).toBe('idle')
    expect(floorActivity('live', 'working', true)).toBe('off')
    expect(floorActivity('unverifiable', 'working', false)).toBe('off')
    const desk = { x: 300, y: 100 }
    expect(positionFor(desk, 'working', 0)).toEqual({ x: 300, y: 122 })
    expect(positionFor(desk, 'idle', 0).y).toBeGreaterThan(300)
  })

  it('keeps sprite variants stable per member', () => {
    expect(spriteVariant('jim', 4)).toBe(spriteVariant('jim', 4))
    expect(spriteVariant('jim', 4)).toBeLessThan(4)
  })
})
