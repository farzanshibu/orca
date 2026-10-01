import { describe, expect, it } from 'vitest'
import { AGENT_STATUS_STATES } from '../../../shared/agent-status-types'
import {
  readTeamMemberTurnState,
  turnStateFromHookState,
  turnStateFromTerminalStatus
} from './team-member-turn-state'

describe('team member turn state', () => {
  it('reads the hook store, which has no idle state, as done = idle', () => {
    expect(AGENT_STATUS_STATES.map((state) => [state, turnStateFromHookState(state)])).toEqual([
      ['working', 'working'],
      ['blocked', 'needs_human'],
      ['waiting', 'needs_human'],
      ['done', 'idle']
    ])
  })

  it('reads the runtime status, and never calls a terminal without an agent idle', () => {
    expect(turnStateFromTerminalStatus({ isRunningAgent: true, status: 'idle' })).toBe('idle')
    expect(turnStateFromTerminalStatus({ isRunningAgent: true, status: 'working' })).toBe('working')
    expect(turnStateFromTerminalStatus({ isRunningAgent: true, status: 'permission' })).toBe(
      'needs_human'
    )
    expect(turnStateFromTerminalStatus({ isRunningAgent: true, status: null })).toBe('unknown')
    expect(turnStateFromTerminalStatus({ isRunningAgent: false, status: 'idle' })).toBe('unknown')
  })

  it('reads a handle the runtime cannot answer for as unknown', async () => {
    await expect(
      readTeamMemberTurnState(
        {
          getTerminalAgentStatus: async () => {
            throw new Error('terminal_handle_stale')
          }
        },
        'term_gone'
      )
    ).resolves.toBe('unknown')
    await expect(
      readTeamMemberTurnState(
        {
          getTerminalAgentStatus: async (handle) => ({
            handle,
            isRunningAgent: true,
            status: 'idle'
          })
        },
        'term_jim'
      )
    ).resolves.toBe('idle')
  })
})
