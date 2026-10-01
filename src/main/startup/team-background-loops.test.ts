import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentHookServer } from '../agent-hooks/server'
import type { AgentHookStatusChangeEntry } from '../agent-hooks/server/server-types'
import { OrchestrationDb } from '../runtime/orchestration/db'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { TeamWebhookServer } from '../runtime/team/team-webhook-server'
import { teamWorkSchedulerFor } from '../runtime/team/team-work-scheduler-for-runtime'

vi.mock('./main-process-state', () => ({
  mainProcessState: { claudeUsage: null, codexUsage: null }
}))

import { startTeamBackgroundLoops } from './team-background-loops'

const PANE = 'tab_j:22222222-2222-4222-8222-222222222222'

describe('team background loops', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let dispose: (() => void) | null
  const statusListeners = new Set<(rows: AgentHookStatusChangeEntry[]) => void>()
  const sendPrompt = vi.fn()

  function publish(state: AgentHookStatusChangeEntry['state']): void {
    for (const listener of statusListeners) {
      listener([{ paneKey: PANE, state, receivedAt: 1, observedInCurrentRuntime: true }])
    }
  }

  function seedJimWithQueue(): void {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h_jim', paneKey: PANE })
    db.enqueueTeamMemberMessage(jim.id, 'first')
    db.enqueueTeamMemberMessage(jim.id, 'second')
  }

  beforeEach(() => {
    vi.useFakeTimers()
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    dispose = null
    statusListeners.clear()
    sendPrompt.mockReset()
    vi.spyOn(agentHookServer, 'subscribeStatusChanges').mockImplementation((listener) => {
      statusListeners.add(listener)
      return () => {
        statusListeners.delete(listener)
      }
    })
    vi.spyOn(runtime, 'getLiveTerminalPaneKey').mockImplementation((handle) =>
      handle === 'h_jim' ? PANE : null
    )
    vi.spyOn(runtime, 'getTerminalAgentStatus').mockImplementation(async (handle) => ({
      handle,
      isRunningAgent: true,
      status: 'idle'
    }))
    vi.spyOn(runtime, 'sendTerminalAgentPrompt').mockImplementation(async (handle, text) => {
      sendPrompt(text)
      return { handle, accepted: true, bytesWritten: text.length }
    })
  })

  afterEach(() => {
    dispose?.()
    vi.useRealTimers()
    vi.restoreAllMocks()
    db.close()
  })

  it('types queued prompts on hook status edges, without waiting for the backstop', async () => {
    seedJimWithQueue()
    dispose = startTeamBackgroundLoops(runtime)

    publish('done')
    await vi.advanceTimersByTimeAsync(500)
    expect(sendPrompt.mock.calls).toEqual([['first']])

    // Same idle edge: the next prompt waits for the agent to take up the first.
    await vi.advanceTimersByTimeAsync(500)
    expect(sendPrompt.mock.calls).toEqual([['first']])

    publish('working')
    publish('done')
    await vi.advanceTimersByTimeAsync(500)
    expect(sendPrompt.mock.calls).toEqual([['first'], ['second']])
  })

  it('returns a disposer that stops every timer and subscription', async () => {
    const unsubscribeEnriched = vi.fn()
    vi.spyOn(agentHookServer, 'subscribeEnrichedStatus').mockReturnValue(unsubscribeEnriched)
    const stopWebhooks = vi.spyOn(TeamWebhookServer.prototype, 'stop')
    seedJimWithQueue()
    const timersBefore = vi.getTimerCount()

    dispose = startTeamBackgroundLoops(runtime)
    // Spend, queue, work scheduler, missions, activity prune, webhook sync, closing time.
    expect(vi.getTimerCount()).toBe(timersBefore + 7)
    expect(statusListeners.size).toBe(1)
    publish('done')
    // The queue's and the scheduler's pending wake-ups are two more timers the disposer clears.
    expect(vi.getTimerCount()).toBe(timersBefore + 9)

    dispose()
    expect(vi.getTimerCount()).toBe(timersBefore)
    expect(statusListeners.size).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sendPrompt).not.toHaveBeenCalled()
    expect(unsubscribeEnriched).toHaveBeenCalledTimes(1)
    expect(stopWebhooks).toHaveBeenCalledTimes(1)
    dispose()
    expect(stopWebhooks).toHaveBeenCalledTimes(1)
  })

  it('wakes the work scheduler on a status edge, then on its tick, until disposed', async () => {
    seedJimWithQueue()
    const tick = vi.spyOn(teamWorkSchedulerFor(runtime), 'tick')
    dispose = startTeamBackgroundLoops(runtime)

    publish('done')
    await vi.advanceTimersByTimeAsync(500)
    expect(tick).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(tick).toHaveBeenCalledTimes(2)

    dispose()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(tick).toHaveBeenCalledTimes(2)
  })
})
