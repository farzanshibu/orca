import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow } from '../orchestration/team-types'
import { CLOSING_TIME_MESSAGE, TeamClosingTime, beginTeamClosingTime } from './team-closing-time'
import { TeamToolLoopBreaker } from './team-tool-loop-breaker'

const PANE = 'tab_j:22222222-2222-4222-8222-222222222222'

describe('team breakers', () => {
  let db: OrchestrationDb
  let now: number
  const interruptMember = vi.fn(async (_member: TeamMemberRow) => {})
  const notifyMailbox = vi.fn()
  const steerMember = vi.fn(async (_member: TeamMemberRow, _text: string) => {})

  function seed() {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h_jim', paneKey: PANE })
    return { team, jim }
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    now = 1_000_000
    interruptMember.mockClear()
    notifyMailbox.mockClear()
    steerMember.mockClear()
  })

  afterEach(() => {
    db.close()
  })

  it('steers a looping member first, then trips the breaker if it keeps looping', async () => {
    const { jim } = seed()
    const breaker = new TeamToolLoopBreaker(
      () => db,
      { interruptMember, notifyMailbox, steerMember },
      () => now
    )
    const loop = async (times: number) => {
      for (let i = 0; i < times; i += 1) {
        now += 1_000
        await breaker.observe({ paneKey: PANE, toolName: 'Bash', toolInput: 'npm test' })
      }
    }
    await loop(5)
    expect(steerMember).not.toHaveBeenCalled()
    await loop(1)
    expect(steerMember).toHaveBeenCalledTimes(1)
    expect(db.requireTeamMember(jim.id).paused_at).toBeNull()
    await loop(6)
    expect(db.requireTeamMember(jim.id).pause_reason).toBe('tool_loop')
    expect(interruptMember).toHaveBeenCalledTimes(1)
  })

  it('does not count varied work as a loop', async () => {
    seed()
    const breaker = new TeamToolLoopBreaker(
      () => db,
      { interruptMember, notifyMailbox, steerMember },
      () => now
    )
    for (let i = 0; i < 20; i += 1) {
      now += 1_000
      await breaker.observe({ paneKey: PANE, toolName: 'Read', toolInput: `file-${i}` })
    }
    expect(steerMember).not.toHaveBeenCalled()
  })

  it('winds a team down: tell running members, stop them once quiet, then pause the team', async () => {
    const { team, jim } = seed()
    const live = new Set(['h_jim'])
    let status = 'working'
    const stopMember = vi.fn(async (member: TeamMemberRow) => {
      live.delete(member.terminal_handle ?? '')
    })
    expect(beginTeamClosingTime(db, team, (member) => live.has(member.terminal_handle ?? ''))).toBe(
      1
    )
    expect(db.listPendingTeamQueue(jim.id)[0].text).toBe(CLOSING_TIME_MESSAGE)
    const closing = new TeamClosingTime({
      getDb: () => db,
      resolveLiveHandle: (member) =>
        live.has(member.terminal_handle ?? '') ? member.terminal_handle : null,
      getAgentStatus: async () => status,
      stopMember
    })
    await closing.tick()
    expect(stopMember).not.toHaveBeenCalled()
    db.settleTeamQueueItem(db.listPendingTeamQueue(jim.id)[0].id, { delivered: true })
    status = 'idle'
    await closing.tick()
    await closing.tick()
    await closing.tick()
    expect(stopMember).toHaveBeenCalledTimes(1)
    expect(db.requireTeam(team.id)).toMatchObject({ status: 'paused', closing_at: null })
  })
})
