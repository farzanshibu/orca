import type { TeamListEntry, TeamLogMessage, TeamSnapshot } from './team-snapshot-types'

export type TeamPageModel = {
  /** The repository and host the page shows; null with no repository open. */
  scope: string | null
  /** The newest request issued; only a response carrying this number is applied. */
  generation: number
  /** False until a response lands for this repository, so "no team yet" is never shown early. */
  loaded: boolean
  teams: TeamListEntry[]
  selectedTeamId: string | null
  snapshot: TeamSnapshot | null
  log: TeamLogMessage[]
  /** Why the last refresh failed. The previous snapshot stays as it was. */
  connectionError: string | null
  /** Why the last failed action failed. Only the user clears it. */
  actionError: string | null
  /** Keys of actions in flight, one entry per call. */
  pendingActions: readonly string[]
}

export type TeamPageLoad = {
  teams: TeamListEntry[]
  selectedTeamId: string | null
  snapshot: TeamSnapshot | null
  log: TeamLogMessage[]
}

export type TeamPageEvent =
  | { type: 'requested'; generation: number; scope: string | null }
  | { type: 'team-selected'; generation: number; teamId: string }
  | ({ type: 'loaded'; generation: number } & TeamPageLoad)
  | { type: 'load-failed'; generation: number; message: string }
  | { type: 'action-started'; key: string }
  | { type: 'action-settled'; key: string; error: string | null }
  | { type: 'action-error-dismissed' }

export const INITIAL_TEAM_PAGE_MODEL: TeamPageModel = {
  scope: null,
  generation: 0,
  loaded: false,
  teams: [],
  selectedTeamId: null,
  snapshot: null,
  log: [],
  connectionError: null,
  actionError: null,
  pendingActions: []
}

function withoutOne(keys: readonly string[], key: string): readonly string[] {
  const index = keys.indexOf(key)
  return index === -1 ? keys : keys.filter((_, at) => at !== index)
}

export function reduceTeamPage(model: TeamPageModel, event: TeamPageEvent): TeamPageModel {
  switch (event.type) {
    case 'requested': {
      const generation = Math.max(model.generation, event.generation)
      if (event.scope === model.scope) {
        return { ...model, generation }
      }
      // A new repository or host: nothing shown for the old one may stay, but a failed action
      // and one still in flight are the user's own and outlive the switch.
      return {
        ...INITIAL_TEAM_PAGE_MODEL,
        scope: event.scope,
        generation,
        actionError: model.actionError,
        pendingActions: model.pendingActions
      }
    }
    case 'team-selected':
      if (event.teamId === model.selectedTeamId) {
        return model
      }
      // Cleared so the old team's floor is never shown under the new team's name.
      return {
        ...model,
        generation: Math.max(model.generation, event.generation),
        selectedTeamId: event.teamId,
        snapshot: null,
        log: []
      }
    case 'loaded':
      if (event.generation !== model.generation) {
        return model
      }
      return {
        ...model,
        loaded: true,
        teams: event.teams,
        selectedTeamId: event.selectedTeamId,
        snapshot: event.snapshot,
        log: event.log,
        connectionError: null
      }
    case 'load-failed':
      if (event.generation !== model.generation) {
        return model
      }
      // Why nothing else changes: losing contact is not evidence that anything on the floor did.
      return { ...model, connectionError: event.message }
    case 'action-started':
      return { ...model, pendingActions: [...model.pendingActions, event.key] }
    case 'action-settled':
      return {
        ...model,
        pendingActions: withoutOne(model.pendingActions, event.key),
        actionError: event.error ?? model.actionError
      }
    case 'action-error-dismissed':
      return model.actionError === null ? model : { ...model, actionError: null }
  }
}

export type TeamPageSource = {
  listTeams: () => Promise<{ teams: TeamListEntry[] }>
  showTeam: (teamId: string) => Promise<TeamSnapshot>
  readTeamLog: (teamId: string) => Promise<{ messages: TeamLogMessage[] }>
}

/**
 * Reads the team list, then the chosen team. Returns null when `isCurrent` turns false between
 * the two, so a superseded load asks the host for nothing more.
 */
export async function loadTeamPage(
  source: TeamPageSource,
  preferredTeamId: string | null,
  isCurrent: () => boolean
): Promise<TeamPageLoad | null> {
  const { teams } = await source.listTeams()
  if (!isCurrent()) {
    return null
  }
  const selectedTeamId =
    teams.find((team) => team.id === preferredTeamId)?.id ?? teams[0]?.id ?? null
  if (!selectedTeamId) {
    return { teams, selectedTeamId: null, snapshot: null, log: [] }
  }
  const [snapshot, log] = await Promise.all([
    source.showTeam(selectedTeamId),
    source.readTeamLog(selectedTeamId)
  ])
  return { teams, selectedTeamId, snapshot, log: log.messages }
}
