import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationRunUsage } from '../../../shared/automations-types'
import { OrchestrationDb } from '../orchestration/db'
import { TeamSpendMonitor, sumTeamMemberUsage } from './team-spend-monitor'

function usage(costUsd: number | null, tokens: number): AutomationRunUsage {
  return {
    status: 'known',
    provider: 'claude',
    model: 'opus',
    inputTokens: tokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningOutputTokens: null,
    totalTokens: tokens,
    estimatedCostUsd: costUsd,
    estimatedCostSource: costUsd === null ? null : 'api_equivalent',
    providerSessionId: 's',
    attribution: 'provider_session_time_window',
    collectedAt: 0,
    unavailableReason: null,
    unavailableMessage: null
  }
}

describe('sumTeamMemberUsage', () => {
  it('sums priced sessions and reports unknown cost as null', () => {
    expect(sumTeamMemberUsage([usage(1.5, 100), usage(2, 50)])).toEqual({ usd: 3.5, tokens: 150 })
    expect(sumTeamMemberUsage([usage(null, 10)])).toEqual({ usd: null, tokens: 10 })
    expect(sumTeamMemberUsage([])).toEqual({ usd: null, tokens: null })
  })
})

describe('TeamSpendMonitor', () => {
  let db: OrchestrationDb
  const sessionsByPane = new Map<string, string[]>()
  const costBySession = new Map<string, number>()
  const interruptMember = vi.fn(async () => {})
  const notifyMailbox = vi.fn()

  function monitor(): TeamSpendMonitor {
    return new TeamSpendMonitor({
      getDb: () => db,
      getProviderSessionIds: (paneKey) => sessionsByPane.get(paneKey) ?? [],
      getUsageReader: (agent) =>
        agent === 'claude'
          ? {
              getProviderSessionUsage: async (sessions) =>
                sessions.map((s) => usage(costBySession.get(s.sessionId) ?? 0, 10))
            }
          : null,
      interruptMember,
      notifyMailbox
    })
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    sessionsByPane.clear()
    costBySession.clear()
    interruptMember.mockClear()
    notifyMailbox.mockClear()
  })

  afterEach(() => {
    db.close()
  })

  it('keeps spend from sessions a /clear replaced and trips the breaker once at the cap', async () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'claude' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h', paneKey: 'pane' })
    db.setTeamMemberSpendCap(jim.id, 5)

    sessionsByPane.set('pane', ['s1'])
    costBySession.set('s1', 3)
    await monitor().tick()
    expect(db.requireTeamMember(jim.id)).toMatchObject({ spend_usd: 3, paused_at: null })

    // /clear: the pane now reports only s2, but s1 still counts.
    sessionsByPane.set('pane', ['s2'])
    costBySession.set('s2', 2.5)
    await monitor().tick()
    expect(db.requireTeamMember(jim.id)).toMatchObject({
      spend_usd: 5.5,
      pause_reason: 'spend_cap'
    })
    expect(interruptMember).toHaveBeenCalledTimes(1)
    expect(notifyMailbox).toHaveBeenCalledWith(`run:${team.run_id}`)
    expect(db.listRecentTeamMessages(team.run_id, 10)[0]).toMatchObject({
      type: 'escalation',
      subject: expect.stringContaining('jim paused ($5.50 of $5.00)')
    })

    await monitor().tick()
    expect(interruptMember).toHaveBeenCalledTimes(1)
  })

  it('leaves unpriced agents without spend', async () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const pam = db.addTeamMember(team.id, { slug: 'pam', roleSlug: 'x', agent: 'gemini' })
    db.bindTeamMemberTerminal(pam.id, { worktreeId: 'wt', terminalHandle: 'h', paneKey: 'pane' })
    sessionsByPane.set('pane', ['g1'])
    await monitor().tick()
    expect(db.requireTeamMember(pam.id).spend_usd).toBeNull()
    expect(db.listTeamMemberSessions(pam.id)).toHaveLength(1)
  })

  it('trips the token cap when no dollar cap is set', async () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'claude' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h', paneKey: 'pane' })
    db.setTeamMemberSpendCap(jim.id, null, 15)
    sessionsByPane.set('pane', ['s1', 's2'])
    await monitor().tick()
    expect(db.requireTeamMember(jim.id)).toMatchObject({
      spend_tokens: 20,
      pause_reason: 'token_cap'
    })
  })
})
