import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../orchestration/db'
import { teamTaskPrefix } from '../orchestration/db/teams/team-store'
import { CLOSING_TIME_MESSAGE, beginTeamClosingTime } from './team-closing-time'
import { TEAM_TURN_GRACE_MS, TeamMemberTurnLedger } from './team-member-turn-ledger'
import type { TeamMemberTurnState } from './team-member-turn-state'
import { TeamQueueDispatcher, queuedTeamTurnKind } from './team-queue-dispatcher'

describe('team task refs', () => {
  let db: OrchestrationDb

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('derives a prefix and numbers tasks once, in creation order', () => {
    expect(teamTaskPrefix('Big Money Team')).toBe('bmt')
    expect(teamTaskPrefix('Platform')).toBe('pla')
    expect(teamTaskPrefix('!!!')).toBe('task')
    const team = db.createTeam({ repoId: 'repo_1', name: 'Big Money Team' })
    const first = db.createTask({ spec: 'a', runId: team.run_id })
    const second = db.createTask({ spec: 'b', runId: team.run_id })
    expect([...db.assignTeamTaskRefs(team.id).values()].sort()).toEqual(['bmt-1', 'bmt-2'])
    const third = db.createTask({ spec: 'c', runId: team.run_id })
    const refs = db.assignTeamTaskRefs(team.id)
    expect([refs.get(first.id), refs.get(second.id), refs.get(third.id)]).toEqual([
      'bmt-1',
      'bmt-2',
      'bmt-3'
    ])
    expect(db.resolveTeamTaskRef(team.id, 'BMT-2')).toBe(second.id)
    expect(db.resolveTeamTaskRef(team.id, 'task_raw')).toBe('task_raw')
  })
})

describe('TeamQueueDispatcher', () => {
  let db: OrchestrationDb
  let state: TeamMemberTurnState
  let now: number
  let turns: TeamMemberTurnLedger
  const sendPrompt = vi.fn(async (_handle: string, _text: string) => {})

  function dispatcher(): TeamQueueDispatcher {
    return new TeamQueueDispatcher({
      getDb: () => db,
      turns,
      resolveLiveHandle: (member) => member.terminal_handle,
      getTurnState: async () => state,
      sendPrompt
    })
  }

  function seedJim() {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h', paneKey: null })
    return { team, jim }
  }

  const sentTexts = () => sendPrompt.mock.calls.map(([, text]) => text)

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    state = 'idle'
    now = 1_000_000
    turns = new TeamMemberTurnLedger({
      queuedKind: (memberId) => queuedTeamTurnKind(db, memberId),
      now: () => now
    })
    sendPrompt.mockReset()
    sendPrompt.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it('sends the reordered head once per idle edge', async () => {
    const { jim } = seedJim()
    const a = db.enqueueTeamMemberMessage(jim.id, 'first')
    const b = db.enqueueTeamMemberMessage(jim.id, 'second')
    db.reorderTeamQueue(jim.id, [b.id])
    expect(db.listPendingTeamQueue(jim.id).map((item) => item.id)).toEqual([b.id, a.id])

    const loop = dispatcher()
    await loop.tick()
    await loop.tick()
    expect(sentTexts()).toEqual(['second'])

    state = 'working'
    await loop.tick()
    state = 'idle'
    await loop.tick()
    expect(sentTexts()).toEqual(['second', 'first'])
    expect(db.listPendingTeamQueue(jim.id)).toHaveLength(0)
  })

  it('sends the next item after the grace when the working edge was missed', async () => {
    const { jim } = seedJim()
    db.enqueueTeamMemberMessage(jim.id, 'first')
    db.enqueueTeamMemberMessage(jim.id, 'second')
    const loop = dispatcher()
    await loop.tick()
    // The turn was shorter than a tick: the agent is only ever seen idle.
    now += TEAM_TURN_GRACE_MS - 1
    await loop.tick()
    expect(sentTexts()).toEqual(['first'])
    now += 1
    await loop.tick()
    expect(sentTexts()).toEqual(['first', 'second'])
  })

  it('sends the next item at once when a working edge arrives between ticks', async () => {
    const { jim } = seedJim()
    db.enqueueTeamMemberMessage(jim.id, 'first')
    db.enqueueTeamMemberMessage(jim.id, 'second')
    const loop = dispatcher()
    await loop.tick()
    turns.noteWorking(jim.id)
    await loop.tick()
    expect(sentTexts()).toEqual(['first', 'second'])
  })

  it('frees the idle edge when a send fails, so the next item goes', async () => {
    const { jim } = seedJim()
    const boom = db.enqueueTeamMemberMessage(jim.id, 'boom')
    db.enqueueTeamMemberMessage(jim.id, 'after')
    sendPrompt.mockRejectedValueOnce(new Error('terminal_not_writable'))
    const loop = dispatcher()
    await loop.tick()
    expect(db.requireTeamQueueItem(boom.id).failed_reason).toBe('terminal_not_writable')
    expect(turns.holder(jim.id)).toBeNull()
    await loop.tick()
    expect(sentTexts()).toEqual(['boom', 'after'])
    expect(db.listPendingTeamQueue(jim.id)).toHaveLength(0)
  })

  it('types nothing while the agent needs a human or cannot be read', async () => {
    const { jim } = seedJim()
    db.enqueueTeamMemberMessage(jim.id, 'wait')
    const loop = dispatcher()
    state = 'needs_human'
    await loop.tick()
    state = 'unknown'
    await loop.tick()
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('holds the queue for paused members and paused teams', async () => {
    const { team, jim } = seedJim()
    db.enqueueTeamMemberMessage(jim.id, 'hold')
    db.setTeamMemberPaused(jim.id, true)
    await dispatcher().tick()
    db.setTeamMemberPaused(jim.id, false)
    db.updateTeam(team.id, { status: 'paused' })
    await dispatcher().tick()
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('sends only the wrap-up note while the team is closing', async () => {
    const { team, jim } = seedJim()
    db.enqueueTeamMemberMessage(jim.id, 'operator work')
    beginTeamClosingTime(db, team, () => true)
    expect(db.listPendingTeamQueue(jim.id).map((item) => item.source)).toEqual([
      'closing',
      'operator'
    ])
    expect(turns.check(jim.id, 'assignment')).toEqual({ reason: 'outranked', by: 'closing' })

    const loop = dispatcher()
    await loop.tick()
    turns.noteWorking(jim.id)
    await loop.tick()
    expect(sentTexts()).toEqual([CLOSING_TIME_MESSAGE])
    expect(db.listPendingTeamQueue(jim.id).map((item) => item.text)).toEqual(['operator work'])
  })

  it('wakes for a pass shortly after a status edge, and not after stop', async () => {
    vi.useFakeTimers()
    const { jim } = seedJim()
    db.enqueueTeamMemberMessage(jim.id, 'first')
    const loop = dispatcher()
    loop.wake()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sendPrompt).not.toHaveBeenCalled()

    loop.start(60_000)
    loop.wake()
    loop.wake()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sentTexts()).toEqual(['first'])

    db.enqueueTeamMemberMessage(jim.id, 'second')
    turns.noteWorking(jim.id)
    loop.wake()
    loop.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(sentTexts()).toEqual(['first'])
  })
})
