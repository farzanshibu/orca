import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useAppStore } from '@/store'
import { useActiveRepo } from '@/store/selectors'
import { getActiveRuntimeTarget, type RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { INITIAL_TEAM_PAGE_MODEL, loadTeamPage, reduceTeamPage } from './team-page-model'
import { listTeams, readTeamLog, showTeam } from './team-runtime-client'
import type { TeamListEntry, TeamLogMessage, TeamSnapshot } from './team-snapshot-types'

const TEAM_POLL_MS = 3_000
const DEFAULT_ACTION_KEY = 'action'

/**
 * Runs a mutation, then refreshes. A failure lands in `actionError` instead of throwing.
 * `key` is the name the call has in `pendingActions` while it runs.
 */
export type TeamAct = (mutation: () => Promise<unknown>, key?: string) => Promise<boolean>

export type TeamPageState = {
  target: RuntimeClientTarget
  repoId: string | null
  repoName: string | null
  teams: TeamListEntry[]
  selectedTeamId: string | null
  selectTeam: (teamId: string) => void
  /** False until the first response for this repository arrives. */
  loaded: boolean
  snapshot: TeamSnapshot | null
  log: TeamLogMessage[]
  /** Set while refreshes fail; the last snapshot stays on screen untouched. */
  connectionError: string | null
  /** The last failed action. Stays until `dismissActionError`. */
  actionError: string | null
  dismissActionError: () => void
  /** Keys of the `act` calls in flight. */
  pendingActions: readonly string[]
  /** True while any `act` call is in flight. */
  busy: boolean
  refresh: () => Promise<void>
  act: TeamAct
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useTeamPageState(): TeamPageState {
  const environmentId = useAppStore((s) => s.settings?.activeRuntimeEnvironmentId)
  // Why the id: the settings object changes on every preference write, and a new target restarts the page.
  const target = useMemo(
    () => getActiveRuntimeTarget({ activeRuntimeEnvironmentId: environmentId }),
    [environmentId]
  )
  const repo = useActiveRepo()
  const repoId = repo?.id ?? null
  const host = target.kind === 'environment' ? target.environmentId : 'local'
  const scope = repoId ? `${host}:${repoId}` : null
  const [model, dispatch] = useReducer(reduceTeamPage, INITIAL_TEAM_PAGE_MODEL)
  // Issued synchronously so a request knows its number before any response can arrive.
  const generationRef = useRef(0)
  const selection = useRef<{ scope: string | null; teamId: string | null }>({
    scope: null,
    teamId: null
  })

  const refresh = useCallback(async () => {
    generationRef.current += 1
    const generation = generationRef.current
    if (selection.current.scope !== scope) {
      selection.current = { scope, teamId: null }
    }
    dispatch({ type: 'requested', generation, scope })
    if (!repoId) {
      return
    }
    const isCurrent = () => generationRef.current === generation
    try {
      const load = await loadTeamPage(
        {
          listTeams: () => listTeams(target, `id:${repoId}`),
          showTeam: (teamId) => showTeam(target, teamId),
          readTeamLog: (teamId) => readTeamLog(target, teamId)
        },
        selection.current.teamId,
        isCurrent
      )
      if (load && isCurrent()) {
        selection.current = { scope, teamId: load.selectedTeamId }
        dispatch({ type: 'loaded', generation, ...load })
      }
    } catch (caught) {
      dispatch({ type: 'load-failed', generation, message: errorMessage(caught) })
    }
  }, [repoId, scope, target])

  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    // Why a chain, not an interval: on a slow link an interval would start a poll before the last
    // one answered, and each new poll supersedes the one before, so none would ever land.
    const poll = async (): Promise<void> => {
      await refresh()
      // With no repository open there is nothing to ask the host for again.
      if (!stopped && scope !== null) {
        timer = window.setTimeout(() => void poll(), TEAM_POLL_MS)
      }
    }
    void poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [refresh, scope])

  const selectTeam = useCallback(
    (teamId: string) => {
      if (teamId === selection.current.teamId) {
        return
      }
      generationRef.current += 1
      selection.current = { ...selection.current, teamId }
      dispatch({ type: 'team-selected', generation: generationRef.current, teamId })
      void refresh()
    },
    [refresh]
  )

  const act = useCallback<TeamAct>(
    async (mutation, key = DEFAULT_ACTION_KEY) => {
      dispatch({ type: 'action-started', key })
      try {
        await mutation()
      } catch (caught) {
        dispatch({ type: 'action-settled', key, error: errorMessage(caught) })
        return false
      }
      // Still pending through the refresh, so a control stays disabled until the page shows the result.
      await refresh()
      dispatch({ type: 'action-settled', key, error: null })
      return true
    },
    [refresh]
  )

  const dismissActionError = useCallback(() => dispatch({ type: 'action-error-dismissed' }), [])

  return {
    target,
    repoId,
    repoName: repo?.displayName ?? null,
    teams: model.teams,
    selectedTeamId: model.selectedTeamId,
    selectTeam,
    loaded: model.loaded,
    snapshot: model.snapshot,
    log: model.log,
    connectionError: model.connectionError,
    actionError: model.actionError,
    dismissActionError,
    pendingActions: model.pendingActions,
    busy: model.pendingActions.length > 0,
    refresh,
    act
  }
}
