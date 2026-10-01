import type { FloorClock } from './office-floor-clock'
import { segmentLength, type FloorPoint } from './office-floor-geometry'
import type { FloorRoute } from './office-floor-navigation'

export const WALK_MIN_MS = 800
export const WALK_MAX_MS = 4_000
/** Art units a character covers in a second, before the duration is clamped. */
export const WALK_UNITS_PER_SECOND = 90

/** How long a walk of `length` art units takes. Going nowhere takes no time. */
export function walkDurationMs(length: number): number {
  if (length <= 0) {
    return 0
  }
  const paced = Math.round((length / WALK_UNITS_PER_SECOND) * 1000)
  return Math.min(WALK_MAX_MS, Math.max(WALK_MIN_MS, paced))
}

export type WalkKeyframe = { offset: number; point: FloorPoint }

/**
 * One keyframe a corner of the route, placed by the distance walked to reach it, so the pace is
 * the same on a long leg as on a short one.
 */
export function walkKeyframes(route: FloorRoute): WalkKeyframe[] {
  const last = route.points.length - 1
  let walked = 0
  return route.points.map((point, index) => {
    if (index > 0) {
      walked += segmentLength({ from: route.points[index - 1], to: point })
    }
    // The ends are exact, so rounding in between can never leave the walk short of its target.
    const offset = index === 0 ? 0 : index === last || route.length <= 0 ? 1 : walked / route.length
    return { offset, point }
  })
}

/**
 * The box a moving sprite is drawn in, in art units, and the point of that box that is put on the
 * floor: a character's feet, the middle of an envelope.
 */
export type SpriteFrame = { w: number; h: number; origin: FloorPoint }

function percent(value: number): string {
  return `${Math.round(value * 10_000) / 100}%`
}

/**
 * The CSS transform that puts a frame's origin on `point`, for a frame laid at the floor's top
 * left. Its percentages are of the frame itself, so it holds at whatever size the floor is drawn.
 */
export function frameTransform(frame: SpriteFrame, point: FloorPoint): string {
  const x = (point.x - frame.origin.x) / frame.w
  const y = (point.y - frame.origin.y) / frame.h
  return `translate(${percent(x)}, ${percent(y)})`
}

/** The part of an animation the floor touches: where it is in time, and stopping it. */
export type FloorAnimation = Pick<Animation, 'currentTime' | 'pause' | 'cancel'>

/** Anything that can be animated; `animate` is missing where there is no Web Animations API. */
export type FloorAnimatable = {
  animate?: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => FloorAnimation
}

/**
 * Walks `element` along a route with one animation. Linear between corners spaced by distance,
 * and held at both ends, so setting `currentTime` puts the walker exactly where it is at that time.
 */
export function animateWalk(
  element: FloorAnimatable,
  route: FloorRoute,
  frame: SpriteFrame,
  durationMs: number
): FloorAnimation | null {
  if (!element.animate || route.points.length < 2 || durationMs <= 0) {
    return null
  }
  return element.animate(
    walkKeyframes(route).map(({ offset, point }) => ({
      offset,
      transform: frameTransform(frame, point)
    })),
    { duration: durationMs, easing: 'linear', fill: 'both' }
  )
}

/** Sends `element` from one point to another in an arc, the way something thrown travels. */
export function animateFlight(
  element: FloorAnimatable,
  from: FloorPoint,
  to: FloorPoint,
  frame: SpriteFrame,
  durationMs: number
): FloorAnimation | null {
  if (!element.animate || durationMs <= 0) {
    return null
  }
  const rise = Math.min(28, 8 + (Math.abs(to.x - from.x) + Math.abs(to.y - from.y)) / 8)
  const apex = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - rise }
  return element.animate(
    [
      { offset: 0, transform: frameTransform(frame, from), easing: 'ease-out' },
      { offset: 0.5, transform: frameTransform(frame, apex), easing: 'ease-in' },
      { offset: 1, transform: frameTransform(frame, to) }
    ],
    { duration: durationMs, fill: 'both' }
  )
}

/** Drops `element` into place from just above where it rests. */
export function animateLanding(
  element: FloorAnimatable,
  durationMs: number
): FloorAnimation | null {
  if (!element.animate) {
    return null
  }
  return element.animate(
    [
      { translate: '0 -80%', opacity: 0 },
      { translate: '0 0', opacity: 1 }
    ],
    { duration: durationMs, easing: 'ease-out', fill: 'both' }
  )
}

/**
 * Ties an animation that began at `startedAt` to the floor's clock, and returns its cleanup. On a
 * real clock it plays on from wherever it should be by now; on a manual one it is held and moved
 * only when the clock is.
 */
export function driveAnimation(
  animation: FloorAnimation,
  clock: FloorClock,
  startedAt: number
): () => void {
  const seek = (): void => {
    animation.currentTime = Math.max(0, clock.now() - startedAt)
  }
  seek()
  if (!clock.manual) {
    return () => animation.cancel()
  }
  animation.pause()
  const stopListening = clock.subscribe(seek)
  return () => {
    stopListening()
    animation.cancel()
  }
}
