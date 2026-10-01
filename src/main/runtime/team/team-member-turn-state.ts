import type { AgentStatusState } from '../../../shared/agent-status-types'
import type { RuntimeTerminalAgentStatus } from '../../../shared/runtime-types'
import type { RpcContext } from '../rpc/core'

/**
 * What a member's agent is doing, as far as typing a prompt into it goes. `unknown` is never
 * idle: a prompt that waits costs less than one typed into a shell or a running turn.
 */
export type TeamMemberTurnState = 'idle' | 'working' | 'needs_human' | 'unknown'

/** Hook-store rows have no `idle`: `done` is the state in which the agent sits at its prompt. */
export function turnStateFromHookState(state: AgentStatusState): TeamMemberTurnState {
  switch (state) {
    case 'done':
      return 'idle'
    case 'working':
      return 'working'
    case 'blocked':
    case 'waiting':
      return 'needs_human'
  }
}

export function turnStateFromTerminalStatus(
  status: Pick<RuntimeTerminalAgentStatus, 'isRunningAgent' | 'status'>
): TeamMemberTurnState {
  // A terminal back at its shell has no agent to take a prompt.
  if (!status.isRunningAgent) {
    return 'unknown'
  }
  switch (status.status) {
    case 'idle':
      return 'idle'
    case 'working':
      return 'working'
    case 'permission':
      return 'needs_human'
    case null:
      return 'unknown'
  }
}

/**
 * Why `getTerminalAgentStatus` and not `getAgentStatusForHandle`: the latter reads only the pane
 * title, so an agent whose title carries no status never reads idle. This one is the runtime's own
 * ranking of the fresh hook row, the title, and a permission prompt on screen.
 */
export async function readTeamMemberTurnState(
  runtime: Pick<RpcContext['runtime'], 'getTerminalAgentStatus'>,
  handle: string
): Promise<TeamMemberTurnState> {
  try {
    return turnStateFromTerminalStatus(await runtime.getTerminalAgentStatus(handle))
  } catch {
    // A stale or exited handle answers nothing.
    return 'unknown'
  }
}
