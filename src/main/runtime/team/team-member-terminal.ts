import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow } from '../orchestration/team-types'

/** The standing member a terminal is: by its handle, else by the pane a reminted handle still occupies. */
export function findTeamMemberForTerminal(
  db: OrchestrationDb,
  terminalHandle: string | null | undefined,
  paneKey: string | null | undefined
): TeamMemberRow | undefined {
  return (
    (terminalHandle ? db.findTeamMemberByTerminal(terminalHandle) : undefined) ??
    (paneKey ? db.findTeamMemberByPaneKey(paneKey) : undefined)
  )
}
