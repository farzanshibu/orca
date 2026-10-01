// @vitest-environment happy-dom

import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { officeProof, useOfficeProof } from './office-choreography-proof'
import { dispatchEntry, mailEntry } from './office-choreography-test-fixtures'
import { FloorActors } from './office-floor-actors'
import { officeFloorPlan } from './office-floor-plan'
import type { PlacedMember } from './office-floor-roster'
import { seatRoster } from './office-floor-seating'
import type { FloorActivity } from './office-floor-state'
import type { TeamActivityEntry } from './team-activity-merge'
import { makeTeamMember } from './team-snapshot-test-fixtures'
import { useOfficeChoreography } from './use-office-choreography'

// Why not act(): the proof promises the DOM is current when its calls return, with nothing awaited.
globalThis.IS_REACT_ACT_ENVIRONMENT = false

function placedMember(id: string, activity: FloorActivity, manager = false): PlacedMember {
  return {
    member: makeTeamMember({ id, slug: id, display_name: id, is_manager: manager ? 1 : 0 }),
    activity,
    needsYou: false,
    tool: '',
    task: undefined
  }
}

const PLACED = [
  placedMember('lead', 'waiting', true),
  placedMember('ada', 'waiting'),
  placedMember('bo', 'working'),
  placedMember('cy', 'waiting')
]
const SEATING = seatRoster(PLACED.map(({ member }) => member))
const STAGE = { plan: officeFloorPlan('wide', SEATING.pods.length), seating: SEATING }
const NOBODY: ReadonlySet<string> = new Set()

/** The floor's own wiring, without the rest of the floor. */
function Harness({ live }: { live: readonly TeamActivityEntry[] }): React.JSX.Element {
  const proof = useOfficeProof()
  const placed = PLACED.map((entry) => ({
    ...entry,
    activity: proof?.activity.get(entry.member.id) ?? entry.activity
  }))
  const choreography = useOfficeChoreography({
    activity: { live, epoch: 1 },
    stage: STAGE,
    placed,
    proof
  })
  return (
    <div
      data-floor-meeting={choreography.scene.meeting ?? undefined}
      data-floor-clock={choreography.clock.manual ? 'manual' : undefined}
    >
      <FloorActors stage={STAGE} placed={placed} choreography={choreography} highlighted={NOBODY} />
    </div>
  )
}

let container: HTMLDivElement
let root: Root

function show(live: readonly TeamActivityEntry[]): void {
  flushSync(() => root.render(<Harness live={live} />))
}

function actors(): string[] {
  return [...container.querySelectorAll('[data-floor-actor]')].map(
    (element) =>
      `${element.getAttribute('data-floor-actor')}:${element.getAttribute('data-pose')}:${element.getAttribute('data-place')}`
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  officeProof.uninstall()
  container.remove()
  vi.useRealTimers()
})

describe('useOfficeChoreography', () => {
  it('acts out what arrives after mount, on one timer, and nothing that was already there', () => {
    const before = [mailEntry(1, Date.now(), 'cy', ['bo'])]
    show(before)
    expect(actors()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)

    show([...before, mailEntry(2, Date.now(), 'ada', ['bo'])])
    expect(actors()).toEqual(['ada:walking:beside:bo'])
    expect(vi.getTimerCount()).toBe(1)

    // The one timer is the end of the walk.
    flushSync(() => vi.advanceTimersToNextTimer())
    expect(actors()).toEqual(['ada:standing:beside:bo'])
    flushSync(() => vi.advanceTimersByTime(60_000))
    expect(actors()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves no timer behind when the floor unmounts mid-walk', () => {
    show([])
    show([mailEntry(1, Date.now(), 'ada', ['bo'])])
    expect(vi.getTimerCount()).toBe(1)

    flushSync(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    root = createRoot(container)
  })

  it('hands the floor to an installed proof: its clock, its events, and a current DOM', () => {
    show([])
    officeProof.install({ now: 5_000 })
    expect(container.querySelector('[data-floor-clock="manual"]')).not.toBeNull()

    // The team's own activity is set aside while the proof runs.
    show([mailEntry(1, Date.now(), 'ada', ['bo'])])
    expect(actors()).toEqual([])

    officeProof.push([dispatchEntry(1, 0, 'ada').event, dispatchEntry(2, 0, 'cy').event])
    expect(container.querySelector('[data-floor-meeting]')).toBeNull()
    officeProof.advance(1_200)
    expect(container.querySelector('[data-floor-meeting="kickoff"]')).not.toBeNull()
    expect(actors()).toEqual([
      'lead:walking:whiteboard',
      'ada:walking:conference:0',
      'cy:walking:conference:1'
    ])
    officeProof.advance(4_000)
    expect(actors()).toEqual([
      'lead:standing:whiteboard',
      'ada:sitting:conference:0',
      'cy:sitting:conference:1'
    ])
    // A real timer would have moved it on by now; a manual clock never sets one.
    expect(vi.getTimerCount()).toBe(0)

    officeProof.uninstall()
    expect(container.querySelector('[data-floor-clock="manual"]')).toBeNull()
    expect(actors()).toEqual([])
  })

  it('walks nobody once a proof reduces motion or says a member is working', () => {
    show([])
    officeProof.install({ now: 5_000 })
    officeProof.setActivity('ada', 'working')
    officeProof.push([dispatchEntry(1, 0, 'ada').event])
    officeProof.advance(1_200)
    expect(actors()).toEqual([])

    officeProof.push([dispatchEntry(2, 0, 'cy').event])
    officeProof.advance(1_300)
    expect(actors()).toEqual(['cy:walking:whiteboard'])
    officeProof.setReducedMotion(true)
    expect(actors()).toEqual([])
  })

  it('gives a walk one animation, seeks it with the manual clock, and cancels it on arrival', () => {
    type Started = {
      keyframes: Keyframe[]
      options: KeyframeAnimationOptions
      currentTime: number | null
      pause: () => void
      cancel: () => void
    }
    const started: Started[] = []
    const animate = (keyframes: Keyframe[], options: KeyframeAnimationOptions): Started => {
      const animation = { keyframes, options, currentTime: null, pause: vi.fn(), cancel: vi.fn() }
      started.push(animation)
      return animation
    }
    // happy-dom has no Web Animations API of its own to drive; a browser's elements all have `animate`.
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
    try {
      show([])
      officeProof.install({ now: 5_000 })
      officeProof.push([mailEntry(1, 0, 'ada', ['bo']).event])

      expect(started).toHaveLength(1)
      const [walk] = started
      expect(walk.options).toMatchObject({ easing: 'linear', fill: 'both' })
      expect(walk.options.duration).toBeGreaterThanOrEqual(800)
      expect(walk.options.duration).toBeLessThanOrEqual(4_000)
      expect(walk.keyframes.length).toBeGreaterThanOrEqual(2)
      expect(walk.keyframes.map(({ offset }) => offset)).toEqual(
        walk.keyframes.map(({ offset }) => offset).toSorted((a, b) => Number(a) - Number(b))
      )
      expect(walk.pause).toHaveBeenCalledTimes(1)
      expect(walk.currentTime).toBe(0)

      officeProof.advance(300)
      expect(walk.currentTime).toBe(300)
      expect(started).toHaveLength(1)
      expect(walk.cancel).not.toHaveBeenCalled()

      // Someone else setting off re-renders the floor; the walk under way keeps its animation.
      officeProof.push([mailEntry(2, 0, 'cy', ['bo']).event])
      officeProof.advance(100)
      expect(actors()).toEqual(['ada:walking:beside:bo', 'cy:walking:beside:bo'])
      expect(started).toHaveLength(2)
      expect(walk.cancel).not.toHaveBeenCalled()
      expect(walk.currentTime).toBe(400)

      // It arrives and stands by the desk: its animation is gone, and no new one took its place.
      officeProof.advance(Number(walk.options.duration) - 400)
      expect(actors()[0]).toBe('ada:standing:beside:bo')
      expect(walk.cancel).toHaveBeenCalledTimes(1)
      expect(started).toHaveLength(2)
    } finally {
      Reflect.deleteProperty(Element.prototype, 'animate')
      if (original) {
        Object.defineProperty(Element.prototype, 'animate', original)
      }
    }
  })
})
