import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useActiveRepo } from '@/store/selectors'
import { getActiveRuntimeTarget, type RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { listTeams, readTeamLog, showTeam } from './team-runtime-client'
import type { TeamListEntry, TeamLogMessage, TeamSnapshot } from './team-snapshot-types'

const TEAM_POLL_MS = 3_000

export type TeamPageState = {
  target: RuntimeClientTarget
  repoId: string | null
  repoName: string | null
  teams: TeamListEntry[]
  selectedTeamId: string | null
  selectTeam: (teamId: string) => void
  snapshot: TeamSnapshot | null
  log: TeamLogMessage[]
  error: string | null
  refresh: () => Promise<void>
  /** Runs a mutation, then refreshes; failures surface in `error` rather than throwing. */
  act: (mutation: () => Promise<unknown>) => Promise<boolean>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useTeamPageState(): TeamPageState {
  const settings = useAppStore((s) => s.settings)
  const target = useMemo(() => getActiveRuntimeTarget(settings), [settings])
  const repo = useActiveRepo()
  const repoId = repo?.id ?? null
  const [teams, setTeams] = useState<TeamListEntry[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<TeamSnapshot | null>(null)
  const [log, setLog] = useState<TeamLogMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const selectedRef = useRef(selectedTeamId)
  selectedRef.current = selectedTeamId

  const refresh = useCallback(async () => {
    if (!repoId) {
      setTeams([])
      setSnapshot(null)
      return
    }
    try {
      const { teams: listed } = await listTeams(target, `id:${repoId}`)
      setTeams(listed)
      const teamId =
        listed.find((team) => team.id === selectedRef.current)?.id ?? listed[0]?.id ?? null
      if (teamId !== selectedRef.current) {
        setSelectedTeamId(teamId)
      }
      if (!teamId) {
        setSnapshot(null)
        setLog([])
        return
      }
      const [nextSnapshot, nextLog] = await Promise.all([
        showTeam(target, teamId),
        readTeamLog(target, teamId)
      ])
      setSnapshot(nextSnapshot)
      setLog(nextLog.messages)
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [repoId, target])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), TEAM_POLL_MS)
    return () => window.clearInterval(timer)
  }, [refresh, selectedTeamId])

  const act = useCallback(
    async (mutation: () => Promise<unknown>) => {
      try {
        await mutation()
        await refresh()
        return true
      } catch (caught) {
        setError(errorMessage(caught))
        return false
      }
    },
    [refresh]
  )

  return {
    target,
    repoId,
    repoName: repo?.displayName ?? null,
    teams,
    selectedTeamId,
    selectTeam: setSelectedTeamId,
    snapshot,
    log,
    error,
    refresh,
    act
  }
}
