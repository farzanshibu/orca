import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamDispatchWaitReason } from '../../../shared/team-task-assignment'
import { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import { TeamMemberTurnLedger } from './team-member-turn-ledger'
import type { TeamMemberTurnState } from './team-member-turn-state'
import { queuedTeamTurnKind } from './team-queue-dispatcher'
import type { TeamTaskDispatchResult } from './team-task-dispatch'
import { TEAM_SCHEDULER_SENDER, TEAM_START_RETRY_DELAYS_MS } from './team-task-start-retry'
import { TeamWorkScheduler } from './team-work-scheduler'

const MAX_DEPTH = Number.MAX_SAFE_INTEGER
const [FIRST_RETRY_MS, SECOND_RETRY_MS] = TEAM_START_RETRY_DELAYS_MS

describe('TeamWorkScheduler', () => {
  let db: OrchestrationDb
  let team: TeamRow
  let manager: TeamMemberRow
  let now: number
  let turns: TeamMemberTurnLedger
  const waits = new Map<string, TeamDispatchWaitReason>()
  const states = new Map<string, TeamMemberTurnState>()
  const notifyMailbox = vi.fn()
  const startDispatch =
    vi.fn<
      (
        db: OrchestrationDb,
        team: TeamRow,
        taskId: string,
        member: TeamMemberRow
      ) => Promise<TeamTaskDispatchResult>
    >()

  /** What a real start leaves behind: the task dispatched to the member's terminal. */
  async function startOnTerminal(taskId: string, member: TeamMemberRow) {
    const dispatch = db.createDispatchContext({
      taskId,
      assigneeHandle: member.terminal_handle ?? member.slug,
      creator: { kind: 'system' },
      maxDepth: MAX_DEPTH
    })
    return { outcome: 'started' as const, dispatchId: dispatch.id, receipt: null }
  }

  /** What a real failed start leaves behind: a failed Dispatch and a failed task. */
  async function failStart(taskId: string) {
    const retryOf =
      db.getTask(taskId)?.status === 'failed' ? db.getDispatchContext(taskId)?.id : undefined
    const started = db.createStartingWorkerDispatch({
      taskId,
      retryOf,
      startOptions: {},
      creator: { kind: 'system' },
      maxDepth: MAX_DEPTH
    })
    db.failWorkerStart(started.dispatch.id, 'agent_readiness', 'Agent did not become ready.')
    return {
      outcome: 'failed' as const,
      dispatchId: started.dispatch.id,
      error: 'Agent did not become ready.',
      receipt: null
    }
  }

  function scheduler(): TeamWorkScheduler {
    return new TeamWorkScheduler({
      getDb: () => db,
      turns,
      resolveLiveHandle: (member) => member.terminal_handle,
      getTurnState: async (handle) => states.get(handle) ?? 'idle',
      dispatchWait: (_db, _team, _task, member) => waits.get(member.slug) ?? null,
      startDispatch,
      notifyMailbox,
      workspaceFacts: async () => ({ cli: 'orca', kind: 'git' }),
      now: () => now
    })
  }

  function addMember(slug: string): TeamMemberRow {
    const member = db.addTeamMember(team.id, { slug, roleSlug: 'engineer', agent: 'codex' })
    return db.bindTeamMemberTerminal(member.id, {
      worktreeId: `wt_${slug}`,
      terminalHandle: `term_${slug}`,
      paneKey: null
    })
  }

  function addTask(
    spec: string,
    options: { assignee?: TeamMemberRow; deps?: string[]; parentId?: string } = {}
  ) {
    const task = db.createTask({
      runId: team.run_id,
      spec,
      deps: options.deps,
      parentId: options.parentId
    })
    if (options.assignee) {
      db.assignTeamTask(team.id, task.id, options.assignee.id)
    }
    return task
  }

  const startedTasks = () => startDispatch.mock.calls.map(([, , taskId]) => taskId)

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    manager = db.addTeamMember(team.id, {
      slug: 'michael',
      roleSlug: 'manager',
      agent: 'claude',
      isManager: true
    })
    now = Date.parse('2026-10-01T10:00:00.000Z')
    turns = new TeamMemberTurnLedger({
      queuedKind: (memberId) => queuedTeamTurnKind(db, memberId),
      now: () => now
    })
    waits.clear()
    states.clear()
    notifyMailbox.mockReset()
    startDispatch.mockReset()
    startDispatch.mockImplementation((_db, _team, taskId, member) =>
      startOnTerminal(taskId, member)
    )
  })

  afterEach(() => {
    db.close()
  })

  it('starts only ready, assigned tasks, and a dependent once its dependency is done', async () => {
    const jim = addMember('jim')
    const pam = addMember('pam')
    const goal = addTask('Ship v2')
    db.markTeamTaskKind(team.id, goal.id, 'goal')
    // Even a goal that somehow has an owner is never worked.
    db.db
      .prepare('UPDATE team_task_refs SET assignee_member_id = ? WHERE task_id = ?')
      .run(pam.id, goal.id)
    addTask('Nobody owns this')
    const schema = addTask('Schema', { assignee: jim, parentId: goal.id })
    const handlers = addTask('Handlers', { assignee: pam, deps: [schema.id], parentId: goal.id })

    const loop = scheduler()
    await loop.tick()
    expect(startedTasks()).toEqual([schema.id])

    db.updateTaskStatus(schema.id, 'completed', 'done')
    await loop.tick()
    expect(startedTasks()).toEqual([schema.id, handlers.id])
    expect(startDispatch.mock.calls[1]?.[3].slug).toBe('pam')
  })

  it('gives a member one task at a time, oldest assignment first', async () => {
    const jim = addMember('jim')
    const first = addTask('First', { assignee: jim })
    const second = addTask('Second', { assignee: jim })
    const loop = scheduler()
    await loop.tick()
    await loop.tick()
    expect(startedTasks()).toEqual([first.id])
    await expect(loop.explainWait(db, team, jim, second.id)).resolves.toBe('member_busy')

    // Finished, but the idle edge the first dispatch was typed on is still spent.
    db.updateTaskStatus(first.id, 'completed', 'done')
    await loop.tick()
    expect(startedTasks()).toEqual([first.id])
    turns.noteWorking(jim.id)
    await loop.tick()
    expect(startedTasks()).toEqual([first.id, second.id])
  })

  it('starts different members together, without waiting for one start to finish', async () => {
    const jim = addMember('jim')
    const pam = addMember('pam')
    const a = addTask('A', { assignee: jim })
    const b = addTask('B', { assignee: pam })
    const releases: (() => void)[] = []
    startDispatch.mockImplementation(async (_db, _team, taskId, member) => {
      await new Promise<void>((resolve) => releases.push(resolve))
      return startOnTerminal(taskId, member)
    })
    const loop = scheduler()
    const pass = loop.tick()
    await vi.waitFor(() => expect(startedTasks()).toEqual([a.id, b.id]))
    // A second pass while both starts are in flight must not start either again.
    const overlap = loop.tick()
    await expect(loop.considerNow(team, a.id, jim)).resolves.toEqual({
      outcome: 'waiting',
      waiting: 'member_busy'
    })
    releases.forEach((release) => release())
    await Promise.all([pass, overlap])
    expect(startDispatch).toHaveBeenCalledTimes(2)
  })

  it('holds the team to max_parallel, counting a start still in flight', async () => {
    const jim = addMember('jim')
    const pam = addMember('pam')
    const a = addTask('A', { assignee: jim })
    const b = addTask('B', { assignee: pam })
    db.updateTeam(team.id, { maxParallel: 1 })
    const loop = scheduler()
    await loop.tick()
    await loop.tick()
    expect(startedTasks()).toEqual([a.id])
    await expect(loop.explainWait(db, db.requireTeam(team.id), pam, b.id)).resolves.toBe(
      'team_at_capacity'
    )

    db.updateTaskStatus(a.id, 'completed', 'done')
    await loop.tick()
    expect(startedTasks()).toEqual([a.id, b.id])
  })

  it('retries a failed start after 1 minute, then 5, then escalates to the manager', async () => {
    const jim = addMember('jim')
    const task = addTask('Flaky', { assignee: jim })
    startDispatch.mockImplementation((_db, _team, taskId) => failStart(taskId))
    const loop = scheduler()

    await loop.tick()
    expect(startDispatch).toHaveBeenCalledTimes(1)
    expect(turns.holder(jim.id)).toBeNull()
    now += FIRST_RETRY_MS - 1
    await loop.tick()
    expect(startDispatch).toHaveBeenCalledTimes(1)
    await expect(loop.explainWait(db, team, jim, task.id)).resolves.toBe('retry_backoff')

    now += 1
    await loop.tick()
    expect(startDispatch).toHaveBeenCalledTimes(2)
    now += SECOND_RETRY_MS - 1
    await loop.tick()
    expect(startDispatch).toHaveBeenCalledTimes(2)
    expect(notifyMailbox).not.toHaveBeenCalled()

    now += 1
    await loop.tick()
    expect(startDispatch).toHaveBeenCalledTimes(3)
    expect(db.getTeamTaskMeta(task.id)).toMatchObject({ start_failures: 3, retry_at: null })
    expect(notifyMailbox).toHaveBeenCalledExactlyOnceWith(`run:${team.run_id}`)
    expect(db.listRecentTeamMessages(team.run_id, 5)[0]).toMatchObject({
      from_handle: TEAM_SCHEDULER_SENDER,
      to_handle: `run:${team.run_id}`,
      type: 'escalation',
      subject: 'pla-1 did not start on jim after 3 tries'
    })

    // Escalated: Orca stops trying until the manager assigns the task again.
    now += 24 * 60 * 60_000
    await loop.tick()
    expect(startDispatch).toHaveBeenCalledTimes(3)
    await expect(loop.explainWait(db, team, jim, task.id)).resolves.toBe('escalated')

    startDispatch.mockImplementation((_db, _team, taskId, member) => {
      // A reassigned failed task restarts as a retry, which is what the real start does.
      db.updateTaskStatus(taskId, 'ready')
      return startOnTerminal(taskId, member)
    })
    db.assignTeamTask(team.id, task.id, jim.id)
    await loop.tick()
    expect(startDispatch).toHaveBeenCalledTimes(4)
    expect(db.getTask(task.id)?.status).toBe('dispatched')
  })

  it('counts a start that threw, and a dispatch that died after starting', async () => {
    const jim = addMember('jim')
    const pam = addMember('pam')
    const thrown = addTask('Throws', { assignee: jim })
    const dies = addTask('Dies', { assignee: pam })
    startDispatch.mockImplementationOnce(async () => {
      throw new Error('Terminal term_jim is not running a recognized agent.')
    })
    const loop = scheduler()
    await loop.tick()
    expect(db.getTeamTaskMeta(thrown.id)).toMatchObject({ start_failures: 1 })
    expect(db.getTask(dies.id)?.status).toBe('dispatched')

    const dispatch = db.getDispatchContext(dies.id)
    db.failDispatch(dispatch?.id ?? '', 'Worker stopped sending heartbeats.')
    expect(db.getTask(dies.id)?.status).toBe('ready')
    await loop.tick()
    await loop.tick()
    // Counted once, and not restarted before the backoff runs out.
    expect(db.getTeamTaskMeta(dies.id)).toMatchObject({
      start_failures: 1,
      counted_dispatch_id: dispatch?.id
    })
    expect(startedTasks()).toEqual([thrown.id, dies.id])

    now += FIRST_RETRY_MS
    await loop.tick()
    expect(startedTasks()).toEqual([thrown.id, dies.id, thrown.id, dies.id])
  })

  it('waits on an unverifiable member without counting a failure', async () => {
    const jim = addMember('jim')
    const task = addTask('Build', { assignee: jim })
    waits.set('jim', 'member_unverifiable')
    const loop = scheduler()
    for (let i = 0; i < 5; i += 1) {
      now += SECOND_RETRY_MS
      await loop.tick()
    }
    expect(startDispatch).not.toHaveBeenCalled()
    expect(notifyMailbox).not.toHaveBeenCalled()
    expect(db.getTeamTaskMeta(task.id)).toMatchObject({
      start_failures: 0,
      retry_at: null,
      escalated_at: null
    })
    await expect(loop.explainWait(db, team, jim, task.id)).resolves.toBe('member_unverifiable')

    waits.clear()
    await loop.tick()
    expect(startedTasks()).toEqual([task.id])
  })

  it('types an assignment only into an idle agent with nothing queued ahead of it', async () => {
    const jim = addMember('jim')
    const task = addTask('Build', { assignee: jim })
    const loop = scheduler()

    states.set('term_jim', 'working')
    await loop.tick()
    states.set('term_jim', 'needs_human')
    await loop.tick()
    await expect(loop.explainWait(db, team, jim, task.id)).resolves.toBe('member_needs_input')
    states.set('term_jim', 'idle')
    const queued = db.enqueueTeamMemberMessage(jim.id, 'operator first')
    await loop.tick()
    expect(startDispatch).not.toHaveBeenCalled()
    expect(db.getTeamTaskMeta(task.id)?.start_failures).toBe(0)

    db.settleTeamQueueItem(queued.id, { delivered: true })
    await loop.tick()
    expect(startedTasks()).toEqual([task.id])
    // The idle edge is spent: nothing else is typed until the agent is seen working.
    expect(turns.check(jim.id, 'queue')).toEqual({ reason: 'turn_taken', holder: 'assignment' })
  })

  it('skips paused and closing teams', async () => {
    const jim = addMember('jim')
    addTask('Build', { assignee: jim })
    const loop = scheduler()
    db.updateTeam(team.id, { status: 'paused' })
    await loop.tick()
    db.updateTeam(team.id, { status: 'active' })
    db.setTeamClosing(team.id, true)
    await loop.tick()
    expect(startDispatch).not.toHaveBeenCalled()
  })

  it('asks the manager to review a finished goal once, and again after a task is added', async () => {
    const jim = addMember('jim')
    const goal = addTask('Ship v2')
    db.markTeamTaskKind(team.id, goal.id, 'goal')
    const child = addTask('Schema', { assignee: jim, parentId: goal.id })
    const loop = scheduler()
    await loop.tick()
    expect(db.listPendingTeamQueue(manager.id)).toHaveLength(0)

    db.updateTaskStatus(child.id, 'completed', 'done')
    await loop.tick()
    await loop.tick()
    const nudges = () => db.listPendingTeamQueue(manager.id).map((item) => item.text.split('\n')[0])
    expect(nudges()).toEqual(['REVIEW GOAL pla-1: Ship v2'])
    expect(db.getTeamTaskMeta(goal.id)?.review_requested_at).not.toBeNull()
    expect(
      db.listTeamActivity(team.id, { limit: 50 }).filter((row) => row.kind === 'goal_review')
    ).toMatchObject([{ task_id: goal.id, to_member_id: manager.id, detail: '1 of 1 tasks done' }])

    const extra = addTask('Docs', { assignee: jim, parentId: goal.id })
    await loop.tick()
    expect(db.getTeamTaskMeta(goal.id)?.review_requested_at).toBeNull()
    expect(nudges()).toHaveLength(1)
    db.updateTaskStatus(extra.id, 'completed', 'done')
    await loop.tick()
    // The manager never got to the first nudge, so the second replaces it.
    expect(nudges()).toEqual(['REVIEW GOAL pla-1: Ship v2'])
    expect(
      db.listTeamActivity(team.id, { limit: 50 }).filter((row) => row.kind === 'goal_review')
    ).toHaveLength(2)
  })

  it('wakes for a pass after a status edge and stops with the loops', async () => {
    vi.useFakeTimers()
    try {
      const jim = addMember('jim')
      const task = addTask('Build', { assignee: jim })
      const loop = scheduler()
      loop.start(60_000)
      loop.wake()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(startedTasks()).toEqual([task.id])

      addTask('Later', { assignee: addMember('pam') })
      loop.wake()
      loop.stop()
      await vi.advanceTimersByTimeAsync(120_000)
      expect(startDispatch).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
