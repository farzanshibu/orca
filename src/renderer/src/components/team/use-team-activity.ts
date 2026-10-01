import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import {
  hasRuntimeRpcErrorCode,
  runtimeEnvironmentSupportsCapability
} from '@/runtime/runtime-rpc-client'
import { ORCHESTRATION_TEAM_FANOUT_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import {
  createTeamActivityReader,
  type TeamActivityHost,
  type TeamActivityRoster
} from './team-activity-legacy'
import {
  liveTeamActivity,
  TEAM_ACTIVITY_BUFFER_SIZE,
  type TeamActivityEntry,
  type TeamActivitySource
} from './team-activity-merge'
import { createTeamActivityPoller } from './team-activity-poller'
import { createTeamSnapshotRefreshTrigger } from './team-activity-snapshot-refresh'
import { readTeamActivity, readTeamLog } from './team-runtime-client'
import type { TeamPageState } from './use-team-page-state'

export type { TeamActivityEntry, TeamActivitySource } from './team-activity-merge'

// What the page asked the log for before the feed existed, so an old host is asked for no more.
const LEGACY_LOG_LIMIT = 100

export type TeamActivity = {
  /** Everything the feed shows, oldest first: what the first page held, then what arrived since. */
  entries: readonly TeamActivityEntry[]
  /**
   * Only what arrived after the first page, in sequence order, each with the client time its page
   * landed (`arrivedAt`). This is all the floor may act out; the first page is never in it.
   */
  live: readonly TeamActivityEntry[]
  /** Moves whenever `entries` was replaced, not extended: another team or host, or a host reset. */
  epoch: number
  /** `legacy` while the host only has its message log; null until the first page. */
  source: TeamActivitySource | null
  /** False until a first page lands for this team. */
  loaded: boolean
  /** Set while polls fail; `entries` stays as it was. */
  error: string | null
}

export function subscribeToWindowVisibility(listener: () => void): () => void {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

export function windowIsVisible(): boolean {
  return document.visibilityState !== 'hidden'
}

function teamActivityHost(
  target: RuntimeClientTarget,
  team: string,
  roster: () => TeamActivityRoster
): TeamActivityHost {
  return {
    // The local host is this build, or a web server that cannot be asked: its answer to the call decides.
    supportsActivity: () =>
      target.kind === 'environment'
        ? runtimeEnvironmentSupportsCapability(
            target.environmentId,
            ORCHESTRATION_TEAM_FANOUT_RUNTIME_CAPABILITY
          )
        : Promise.resolve(true),
    readActivity: (afterSequence, signal) =>
      readTeamActivity(target, { team, afterSequence, limit: TEAM_ACTIVITY_BUFFER_SIZE }, signal),
    readLog: async (signal) => (await readTeamLog(target, team, LEGACY_LOG_LIMIT, signal)).messages,
    roster,
    isMethodMissing: (error) => hasRuntimeRpcErrorCode(error, 'method_not_found'),
    now: Date.now
  }
}

/**
 * The team's activity, polled for as long as the page shows that team. Mounted once for the whole
 * page, so the feed keeps what it has when the tab changes.
 */
export function useTeamActivity({
  target,
  snapshot,
  refresh
}: Pick<TeamPageState, 'target' | 'snapshot' | 'refresh'>): TeamActivity {
  const floorVisible = useAppStore((s) => s.teamPageTab === 'floor')
  const windowVisible = useSyncExternalStore(subscribeToWindowVisibility, windowIsVisible)
  const visibility = useRef({ floorVisible, windowVisible })
  const latestRefresh = useRef(refresh)
  const roster = useRef<TeamActivityRoster>({ runId: '', members: [] })
  const [{ poller, refreshTrigger }] = useState(() => {
    const trigger = createTeamSnapshotRefreshTrigger(() => void latestRefresh.current())
    return {
      refreshTrigger: trigger,
      poller: createTeamActivityPoller({
        visibility: () => visibility.current,
        onFresh: trigger.notify
      })
    }
  })
  const teamId = snapshot?.team.id ?? null

  useEffect(() => {
    latestRefresh.current = refresh
  }, [refresh])

  useEffect(() => {
    if (snapshot) {
      roster.current = { runId: snapshot.team.run_id, members: snapshot.members }
    }
  }, [snapshot])

  useEffect(() => {
    visibility.current = { floorVisible, windowVisible }
    poller.retime()
  }, [floorVisible, poller, windowVisible])

  // Starts once the team's snapshot is in, so the roster is there to name the ends of an old log row.
  useEffect(() => {
    if (!teamId) {
      return
    }
    poller.start(createTeamActivityReader(teamActivityHost(target, teamId, () => roster.current)))
    return () => {
      poller.start(null)
      refreshTrigger.cancel()
    }
  }, [poller, refreshTrigger, target, teamId])

  const { log, error } = useSyncExternalStore(poller.subscribe, poller.getState)
  return useMemo(
    () => ({
      entries: log.entries,
      live: liveTeamActivity(log),
      epoch: log.epoch,
      source: log.source,
      loaded: log.cursor !== null,
      error
    }),
    [log, error]
  )
}
