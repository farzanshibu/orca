import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../orchestration/db'
import { teamTaskPrefix } from '../orchestration/db/teams/team-store'
import { TeamQueueDispatcher } from './team-queue-dispatcher'

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
  let status: string | null
  const sendPrompt = vi.fn(async (_handle: string, _text: string) => {})

  function dispatcher(): TeamQueueDispatcher {
    return new TeamQueueDispatcher({
      getDb: () => db,
      resolveLiveHandle: (member) => member.terminal_handle,
      getAgentStatus: async () => status,
      sendPrompt
    })
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    status = 'idle'
    sendPrompt.mockClear()
  })

  afterEach(() => {
    db.close()
  })

  it('sends the reordered head once per idle edge', async () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h', paneKey: null })
    const a = db.enqueueTeamMemberMessage(jim.id, 'first')
    const b = db.enqueueTeamMemberMessage(jim.id, 'second')
    db.reorderTeamQueue(jim.id, [b.id])
    expect(db.listPendingTeamQueue(jim.id).map((item) => item.id)).toEqual([b.id, a.id])

    const loop = dispatcher()
    await loop.tick()
    await loop.tick()
    expect(sendPrompt.mock.calls.map(([, text]) => text)).toEqual(['second'])

    status = 'working'
    await loop.tick()
    status = 'idle'
    await loop.tick()
    expect(sendPrompt.mock.calls.map(([, text]) => text)).toEqual(['second', 'first'])
    expect(db.listPendingTeamQueue(jim.id)).toHaveLength(0)
  })

  it('holds the queue for paused members and paused teams', async () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h', paneKey: null })
    db.enqueueTeamMemberMessage(jim.id, 'hold')
    db.setTeamMemberPaused(jim.id, true)
    await dispatcher().tick()
    db.setTeamMemberPaused(jim.id, false)
    db.updateTeam(team.id, { status: 'paused' })
    await dispatcher().tick()
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('records a failed send instead of retrying it forever', async () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h', paneKey: null })
    const item = db.enqueueTeamMemberMessage(jim.id, 'boom')
    sendPrompt.mockRejectedValueOnce(new Error('terminal_not_writable'))
    await dispatcher().tick()
    expect(db.requireTeamQueueItem(item.id).failed_reason).toBe('terminal_not_writable')
  })
})
