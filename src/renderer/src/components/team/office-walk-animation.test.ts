import { describe, expect, it, vi } from 'vitest'
import { createManualFloorClock, WALL_CLOCK } from './office-floor-clock'
import type { FloorRoute } from './office-floor-navigation'
import {
  WALK_MAX_MS,
  WALK_MIN_MS,
  WALK_UNITS_PER_SECOND,
  animateWalk,
  driveAnimation,
  frameTransform,
  walkDurationMs,
  walkKeyframes
} from './office-walk-animation'

const ROUTE: FloorRoute = {
  points: [
    { x: 0, y: 0 },
    { x: 0, y: 30 },
    { x: 90, y: 30 },
    { x: 90, y: 90 }
  ],
  length: 180
}
const FRAME = { w: 20, h: 40, origin: { x: 10, y: 30 } }

type FakeAnimation = {
  currentTime: number | null
  pause: ReturnType<typeof vi.fn<() => void>>
  cancel: ReturnType<typeof vi.fn<() => void>>
}

function fakeAnimation(): FakeAnimation {
  return { currentTime: null, pause: vi.fn<() => void>(), cancel: vi.fn<() => void>() }
}

describe('walk animation', () => {
  it('spaces keyframes by the distance walked, not by the number of corners', () => {
    expect(walkKeyframes(ROUTE)).toEqual([
      { offset: 0, point: { x: 0, y: 0 } },
      { offset: 30 / 180, point: { x: 0, y: 30 } },
      { offset: 120 / 180, point: { x: 90, y: 30 } },
      { offset: 1, point: { x: 90, y: 90 } }
    ])
  })

  it('paces a walk by its length', () => {
    expect(walkDurationMs(180)).toBe((180 / WALK_UNITS_PER_SECOND) * 1000)
    expect(walkDurationMs(270)).toBeGreaterThan(walkDurationMs(180))
  })

  it('clamps the duration to between 0.8 and 4 seconds', () => {
    expect(WALK_MIN_MS).toBe(800)
    expect(WALK_MAX_MS).toBe(4_000)
    expect(walkDurationMs(1)).toBe(WALK_MIN_MS)
    expect(walkDurationMs(40)).toBe(WALK_MIN_MS)
    expect(walkDurationMs(5_000)).toBe(WALK_MAX_MS)
    expect(walkDurationMs(0)).toBe(0)
  })

  it('places a frame by its origin, as a share of the frame itself', () => {
    expect(frameTransform(FRAME, { x: 10, y: 30 })).toBe('translate(0%, 0%)')
    expect(frameTransform(FRAME, { x: 30, y: 50 })).toBe('translate(100%, 50%)')
  })

  it('walks a route with one animation, linear and held at both ends', () => {
    const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) =>
      fakeAnimation()
    )

    expect(animateWalk({ animate }, ROUTE, FRAME, 2_000)).not.toBeNull()

    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledWith(
      [
        { offset: 0, transform: 'translate(-50%, -75%)' },
        { offset: 30 / 180, transform: 'translate(-50%, 0%)' },
        { offset: 120 / 180, transform: 'translate(400%, 0%)' },
        { offset: 1, transform: 'translate(400%, 150%)' }
      ],
      { duration: 2_000, easing: 'linear', fill: 'both' }
    )
  })

  it('does nothing where there is nowhere to walk or nothing to animate with', () => {
    const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) =>
      fakeAnimation()
    )

    expect(animateWalk({ animate }, { points: [{ x: 0, y: 0 }], length: 0 }, FRAME, 0)).toBeNull()
    // An environment without the Web Animations API.
    expect(animateWalk({}, ROUTE, FRAME, 2_000)).toBeNull()
    expect(animate).not.toHaveBeenCalled()
  })

  it('joins a walk already under way on a real clock, and lets it play', () => {
    const animation = fakeAnimation()
    const started = WALL_CLOCK.now() - 700
    const stop = driveAnimation(animation, WALL_CLOCK, started)

    expect(animation.currentTime).toBeGreaterThanOrEqual(700)
    expect(animation.pause).not.toHaveBeenCalled()
    stop()
    expect(animation.cancel).toHaveBeenCalledTimes(1)
  })

  it('holds a walk on a manual clock and seeks it as the clock is advanced', () => {
    const clock = createManualFloorClock(10_000)
    const animation = fakeAnimation()
    const stop = driveAnimation(animation, clock, 9_600)

    expect(animation.pause).toHaveBeenCalledTimes(1)
    expect(animation.currentTime).toBe(400)
    clock.advance(250)
    expect(animation.currentTime).toBe(650)

    stop()
    clock.advance(1_000)
    expect(animation.currentTime).toBe(650)
    expect(animation.cancel).toHaveBeenCalledTimes(1)
  })
})
