import {
  initialChoreography,
  nextWakeAt,
  stepChoreography,
  type ChoreographyInput
} from './office-choreography'
import { EMPTY_FLOOR_SCENE, floorScene, type FloorScene } from './office-choreography-scene'
import type { ChoreographyState } from './office-choreography-state'
import type { FloorClock } from './office-floor-clock'
import type { TeamActivityEntry } from './team-activity-merge'

export type FloorDirectorInput = Omit<ChoreographyInput, 'live'> & {
  clock: FloorClock
  /** Read at every step, so entries pushed outside React are picked up on the clock's next tick. */
  live: () => readonly TeamActivityEntry[]
}

/**
 * Runs the choreography against a clock and holds the scene it produces. Outside React on purpose:
 * it owns a timer, and a harness moving a manual clock must be able to step it synchronously.
 */
export type FloorDirector = {
  setInput: (input: FloorDirectorInput) => void
  subscribe: (listener: () => void) => () => void
  /** The same object until the floor looks different. */
  scene: () => FloorScene
  /** Stops the timer and lets go of the clock. `setInput` starts it again. */
  dispose: () => void
}

// A wake nearer than a frame away would only repaint the same frame.
const MIN_WAKE_MS = 16

export function createFloorDirector(): FloorDirector {
  const listeners = new Set<() => void>()
  let input: FloorDirectorInput | null = null
  let state: ChoreographyState | null = null
  let scene = EMPTY_FLOOR_SCENE
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopListening: (() => void) | null = null

  const disarm = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const run = (): void => {
    disarm()
    if (!input) {
      return
    }
    const now = input.clock.now()
    const stepInput = { ...input, live: input.live() }
    state = stepChoreography(state ?? initialChoreography(stepInput), stepInput, now)
    const next = floorScene(state, now)
    if (next.key !== scene.key) {
      scene = next
      for (const listener of listeners) {
        listener()
      }
    }
    // A manual clock is stepped by whoever moves it; only a real one needs waking.
    const wakeAt = input.clock.manual ? null : nextWakeAt(state, now)
    if (wakeAt !== null) {
      timer = setTimeout(run, Math.max(MIN_WAKE_MS, wakeAt - now))
    }
  }

  return {
    setInput: (next) => {
      if (next.clock !== input?.clock || stopListening === null) {
        stopListening?.()
        stopListening = next.clock.subscribe(run)
      }
      if (input && next.clock !== input.clock) {
        // Times on one clock mean nothing on another: start over from what is already there.
        state = null
      }
      input = next
      run()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    scene: () => scene,
    dispose: () => {
      disarm()
      stopListening?.()
      stopListening = null
    }
  }
}
