import type { AgentStatusState } from '../../../shared/agent-status-types'
import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow } from '../orchestration/team-types'
import { turnStateFromHookState, type TeamMemberTurnState } from './team-member-turn-state'

type HookStatusRow = { paneKey: string; state: AgentStatusState }

/**
 * Reports each change of a team member's agent state as the hook store records it, so a loop sees
 * a turn shorter than its own tick. The store republishes every row on any change, so only panes
 * whose state moved are looked up. Returns the unsubscribe.
 */
export function watchTeamMemberStatusEdges(deps: {
  getDb: () => OrchestrationDb
  subscribe: (listener: (rows: readonly HookStatusRow[]) => void) => () => void
  onEdge: (member: TeamMemberRow, state: TeamMemberTurnState) => void
}): () => void {
  const lastStateByPane = new Map<string, AgentStatusState>()
  return deps.subscribe((rows) => {
    const present = new Set<string>()
    for (const row of rows) {
      present.add(row.paneKey)
      if (lastStateByPane.get(row.paneKey) === row.state) {
        continue
      }
      lastStateByPane.set(row.paneKey, row.state)
      const member = deps.getDb().findTeamMemberByPaneKey(row.paneKey)
      if (member) {
        deps.onEdge(member, turnStateFromHookState(row.state))
      }
    }
    for (const paneKey of lastStateByPane.keys()) {
      if (!present.has(paneKey)) {
        lastStateByPane.delete(paneKey)
      }
    }
  })
}
