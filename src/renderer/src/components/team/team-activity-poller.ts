import { teamActivityPollDelay, type TeamActivityVisibility } from './team-activity-cadence'
import type { TeamActivityReader } from './team-activity-legacy'
import {
  clearedTeamActivityLog,
  EMPTY_TEAM_ACTIVITY_LOG,
  mergeTeamActivityPage,
  type TeamActivityEntry,
  type TeamActivityLog
} from './team-activity-merge'

export type TeamActivityPollerState = {
  log: TeamActivityLog
  /** Why the last poll failed. The entries stay as they were; the next poll that lands clears it. */
  error: string | null
}

export type TeamActivityPollerOptions = {
  /** Read each time a wait is timed, so a tab or window change needs no restart. */
  visibility: () => TeamActivityVisibility
  /** The live entries a page added. */
  onFresh?: (entries: readonly TeamActivityEntry[]) => void
}

export type TeamActivityPoller = {
  getState: () => TeamActivityPollerState
  subscribe: (listener: () => void) => () => void
  /** Forgets what it holds and reads through `reader` from now on; null stops. */
  start: (reader: TeamActivityReader | null) => void
  /** Re-times the wait in progress after the visibility changed. */
  retime: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Polls one team's activity. Each request is started by the one before it settling, so two are
 * never in flight, and each carries the generation it was issued under: `start` moves the
 * generation and aborts, so an answer for the previous team or host is dropped.
 */
export function createTeamActivityPoller(options: TeamActivityPollerOptions): TeamActivityPoller {
  const listeners = new Set<() => void>()
  let state: TeamActivityPollerState = { log: EMPTY_TEAM_ACTIVITY_LOG, error: null }
  let generation = 0
  let reader: TeamActivityReader | null = null
  let abort: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let failures = 0
  let hasMore = false
  let settledAt = 0

  const publish = (next: TeamActivityPollerState): void => {
    if (next.log === state.log && next.error === state.error) {
      return
    }
    state = next
    for (const listener of listeners) {
      listener()
    }
  }

  const delay = (): number =>
    teamActivityPollDelay({ ...options.visibility(), source: state.log.source, failures, hasMore })

  const wait = (ms: number): void => {
    timer = setTimeout(() => {
      timer = null
      void poll()
    }, ms)
  }

  const poll = async (): Promise<void> => {
    const read = reader
    if (!read || inFlight) {
      return
    }
    const issued = generation
    const controller = new AbortController()
    abort = controller
    inFlight = true
    let fresh: readonly TeamActivityEntry[] = []
    try {
      const result = await read({
        source: state.log.source,
        afterSequence: state.log.cursor,
        signal: controller.signal
      })
      if (issued !== generation) {
        return
      }
      const merged = mergeTeamActivityPage(state.log, result, Date.now())
      failures = 0
      hasMore = result.page.hasMore
      fresh = merged.fresh
      publish({ log: merged.log, error: null })
    } catch (error) {
      if (issued !== generation) {
        return
      }
      failures += 1
      hasMore = false
      publish({ log: state.log, error: errorMessage(error) })
    }
    inFlight = false
    settledAt = Date.now()
    wait(delay())
    if (fresh.length > 0) {
      options.onFresh?.(fresh)
    }
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start: (next) => {
      generation += 1
      abort?.abort()
      abort = null
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      reader = next
      inFlight = false
      failures = 0
      hasMore = false
      if (state.log.cursor !== null || state.error !== null) {
        publish({ log: clearedTeamActivityLog(state.log), error: null })
      }
      void poll()
    },
    retime: () => {
      // With a request in flight there is no wait to move; the one it starts reads the visibility itself.
      if (timer === null) {
        return
      }
      clearTimeout(timer)
      wait(Math.max(0, settledAt + delay() - Date.now()))
    }
  }
}
