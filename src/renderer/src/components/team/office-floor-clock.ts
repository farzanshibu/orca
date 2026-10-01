/** The time the floor runs on. Injected, so a harness can hold it still and move it by hand. */
export type FloorClock = {
  now: () => number
  /** A clock that only moves when it is told to: nothing may set a timer against it. */
  manual: boolean
  /** Hears each move of a manual clock. A real clock never calls. */
  subscribe: (listener: () => void) => () => void
}

export const WALL_CLOCK: FloorClock = {
  now: () => Date.now(),
  manual: false,
  subscribe: () => () => {}
}

export type ManualFloorClock = FloorClock & {
  advance: (ms: number) => void
  /** Tells listeners to look again without moving the time: something else they read has changed. */
  tick: () => void
}

export function createManualFloorClock(startAt: number): ManualFloorClock {
  const listeners = new Set<() => void>()
  let now = startAt
  const tick = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }
  return {
    now: () => now,
    manual: true,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    advance: (ms) => {
      now += Math.max(0, ms)
      tick()
    },
    tick
  }
}
