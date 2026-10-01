import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { e2eConfig } from '@/lib/e2e-config'
import type { TeamActivityEvent } from '../../../../shared/team-activity-event'
import { createManualFloorClock, type ManualFloorClock } from './office-floor-clock'
import type { FloorActivity } from './office-floor-state'
import { TEAM_ACTIVITY_BUFFER_SIZE, type TeamActivityEntry } from './team-activity-merge'

/** What an installed proof replaces on the mounted floor: its clock, its events and its facts. */
export type OfficeProofSession = {
  clock: ManualFloorClock
  /** Every event pushed so far, in sequence order, in place of the team's live activity. */
  entries: () => readonly TeamActivityEntry[]
  /** What a member is doing, where the harness has said so; the snapshot decides the rest. */
  activity: ReadonlyMap<string, FloorActivity>
  /** null leaves the system's motion preference in charge. */
  reducedMotion: boolean | null
  hidden: boolean
}

/**
 * The seam a rendered probe drives the floor through. Nothing here does anything until `install`
 * is called: from then on the floor runs on a clock that only `advance` moves, and acts out only
 * what `push` gives it. Every call leaves the DOM up to date before it returns.
 */
export type OfficeProof = {
  install: (options?: { now?: number }) => void
  uninstall: () => void
  installed: () => boolean
  /** The manual clock's time, or null while nothing is installed. */
  now: () => number | null
  /**
   * Events as though one page of activity had just landed. Fields left out are filled in; `id`
   * and `sequence` are always assigned. Returns the last sequence assigned.
   */
  push: (events: readonly Partial<TeamActivityEvent>[]) => number
  /** Moves the clock forward, and every walk in progress with it. */
  advance: (ms: number) => void
  /** Says what a member is doing; null hands that back to the snapshot. */
  setActivity: (memberId: string, activity: FloorActivity | null) => void
  setReducedMotion: (reduced: boolean | null) => void
  /** Stands in for the window being hidden, which a probe's own window may well be. */
  setHidden: (hidden: boolean) => void
}

const listeners = new Set<() => void>()
let session: OfficeProofSession | null = null
let entries: readonly TeamActivityEntry[] = []
let lastSequence = 0

function publish(next: OfficeProofSession | null): void {
  session = next
  // Why flushSync: a probe asserts on the DOM right after the call that changed it.
  flushSync(() => {
    for (const listener of listeners) {
      listener()
    }
  })
}

function proofEvent(fields: Partial<TeamActivityEvent>, sequence: number): TeamActivityEvent {
  return {
    kind: 'message',
    channel: null,
    status: null,
    message_type: null,
    message_id: null,
    task_id: null,
    task_ref: null,
    goal_id: null,
    dispatch_id: null,
    thread_id: null,
    from: { party: 'system', member_id: null },
    to: { party: 'team', member_ids: [] },
    subject: '',
    body_preview: null,
    created_at: '',
    ...fields,
    sequence,
    id: `proof_${sequence}`
  }
}

export const officeProof: OfficeProof = {
  install: (options) => {
    entries = []
    lastSequence = 0
    publish({
      clock: createManualFloorClock(options?.now ?? Date.now()),
      entries: () => entries,
      activity: new Map(),
      reducedMotion: null,
      hidden: false
    })
  },
  uninstall: () => {
    entries = []
    publish(null)
  },
  installed: () => session !== null,
  now: () => session?.clock.now() ?? null,
  push: (events) => {
    const { clock } = session ?? {}
    if (!clock) {
      return lastSequence
    }
    const arrivedAt = clock.now()
    const pushed = events.map((fields) => {
      lastSequence += 1
      return { event: proofEvent(fields, lastSequence), history: false, arrivedAt }
    })
    entries = [...entries, ...pushed].slice(-TEAM_ACTIVITY_BUFFER_SIZE)
    flushSync(() => clock.tick())
    return lastSequence
  },
  advance: (ms) => {
    const { clock } = session ?? {}
    if (clock) {
      flushSync(() => clock.advance(ms))
    }
  },
  setActivity: (memberId, activity) => {
    if (!session) {
      return
    }
    const next = new Map(session.activity)
    if (activity === null) {
      next.delete(memberId)
    } else {
      next.set(memberId, activity)
    }
    publish({ ...session, activity: next })
  },
  setReducedMotion: (reducedMotion) => {
    if (session) {
      publish({ ...session, reducedMotion })
    }
  },
  setHidden: (hidden) => {
    if (session) {
      publish({ ...session, hidden })
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The installed proof, or null: which is always the case outside a probe. */
export function officeProofSession(): OfficeProofSession | null {
  return session
}

export function useOfficeProof(): OfficeProofSession | null {
  return useSyncExternalStore(subscribe, officeProofSession, officeProofSession)
}

declare global {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface Window {
    officeProof?: OfficeProof
  }
}

// Why gated like `window.__store`: a packaged build has no business exposing a handle that stops the floor's clock.
if ((import.meta.env.DEV || e2eConfig.exposeStore) && typeof window !== 'undefined') {
  window.officeProof = officeProof
}
