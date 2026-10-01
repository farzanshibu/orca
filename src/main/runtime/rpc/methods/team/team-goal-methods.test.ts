import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Repo } from '../../../../../shared/repo-types'
import { OrchestrationDb } from '../../../orchestration/db'
import type { TeamRow } from '../../../orchestration/team-types'
import { OrcaRuntimeService } from '../../../orca-runtime'
import { teamWorkSchedulerFor } from '../../../team/team-work-scheduler-for-runtime'
import { eraseRpcMethods } from '../../core'
import { ORCHESTRATION_TEAM_METHODS } from '.'

const startWorker = vi.hoisted(() => vi.fn())
vi.mock('../orchestration/worker/worker-start-for-run', () => ({ startWorkerForRun: startWorker }))
vi.mock('../../../../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ isPackaged: () => true })
}))

const PANES = {
  term_mgr: 'tab_mgr:11111111-1111-4111-8111-111111111111',
  term_jim: 'tab_jim:22222222-2222-4222-8222-222222222222',
  term_pam: 'tab_pam:33333333-3333-4333-8333-333333333333'
} as const

const StartArgs = z.object({ params: z.object({ task: z.string(), terminal: z.string() }) })
const Created = z.object({ taskId: z.string(), ref: z.string() })
const Events = z.object({
  latestSequence: z.number(),
  events: z.array(z.looseObject({ kind: z.string() }))
})

describe('team goals', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let attestedHandle: keyof typeof PANES | null
  let team: TeamRow
  let repoKind: Repo['kind']
  const livePanes = new Map<string, string>()

  function call(name: string, params: Record<string, unknown>): Promise<unknown> {
    const method = eraseRpcMethods(ORCHESTRATION_TEAM_METHODS).find((m) => m.name === name)
    if (!method) {
      throw new Error(`Method not found: ${name}`)
    }
    return Promise.resolve(
      method.handler(method.params ? method.params.parse(params) : undefined, { runtime })
    )
  }

  const member = (slug: string) => db.resolveTeamMemberSelector(team.id, slug)
  const queued = (slug: string, source: string) =>
    db.listPendingTeamQueue(member(slug).id).filter((item) => item.source === source)

  async function addTask(params: Record<string, unknown>) {
    return Created.parse(await call('orchestration.teamTaskCreate', { team: team.id, ...params }))
  }

  async function activity() {
    return Events.parse(await call('orchestration.teamActivity', { team: team.id }))
  }

  function seedMember(slug: 'michael' | 'jim' | 'pam', handle: keyof typeof PANES) {
    const row = db.addTeamMember(team.id, {
      slug,
      roleSlug: slug === 'michael' ? 'manager' : 'engineer',
      agent: 'codex',
      isManager: slug === 'michael'
    })
    db.bindTeamMemberTerminal(row.id, {
      worktreeId: `wt_${slug}`,
      terminalHandle: handle,
      paneKey: PANES[handle]
    })
    db.setTeamMemberDesiredState(row.id, 'running')
    livePanes.set(handle, PANES[handle])
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    attestedHandle = null
    repoKind = 'git'
    livePanes.clear()
    startWorker.mockReset()
    // What a real start leaves behind: the task dispatched to the member's terminal.
    startWorker.mockImplementation(async (args: unknown) => {
      const { task, terminal } = StartArgs.parse(args).params
      const dispatch = db.createDispatchContext({
        taskId: task,
        assigneeHandle: terminal,
        assigneePaneKey: livePanes.get(terminal),
        creator: { kind: 'system' },
        maxDepth: Number.MAX_SAFE_INTEGER
      })
      return { dispatchId: dispatch.id, state: 'ready' }
    })
    vi.spyOn(runtime, 'showRepo').mockImplementation(async () => ({
      id: 'repo_1',
      path: '/repo',
      displayName: 'repo',
      badgeColor: '#000',
      addedAt: 0,
      kind: repoKind
    }))
    vi.spyOn(runtime, 'getLiveTerminalPaneKey').mockImplementation(
      (handle) => livePanes.get(handle) ?? null
    )
    vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation(
      (handle) => livePanes.get(handle) ?? null
    )
    vi.spyOn(runtime, 'getTerminalHandleForPaneKey').mockReturnValue(null)
    vi.spyOn(runtime, 'getAgentStatusForHandle').mockResolvedValue('idle')
    vi.spyOn(runtime, 'verifyOrchestrationCompatibilityCaller').mockImplementation(() =>
      attestedHandle
        ? {
            hostScope: { kind: 'local', hostId: 'local' },
            terminalHandle: attestedHandle,
            paneKey: PANES[attestedHandle],
            processIncarnation: 'p1',
            launchTokenHash: 'h'
          }
        : null
    )
    team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    seedMember('michael', 'term_mgr')
    seedMember('jim', 'term_jim')
    seedMember('pam', 'term_pam')
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('files a goal and queues the planning prompt for the manager', async () => {
    db.assignTeamTask(
      team.id,
      db.createTask({ runId: team.run_id, spec: 'Earlier work' }).id,
      member('jim').id
    )
    livePanes.delete('term_pam')
    db.setTeamMemberDesiredState(member('pam').id, 'stopped')
    await expect(
      call('orchestration.teamGoalCreate', { team: team.id, title: 'Ship the v2 API' })
    ).resolves.toMatchObject({ ref: 'pla-2', title: 'Ship the v2 API', queued: true })
    expect(db.listTeamTaskMeta(team.id)[1]).toMatchObject({ kind: 'goal' })

    const [prompt] = queued('michael', 'goal')
    expect(prompt?.text).toContain('GOAL pla-2: Ship the v2 API')
    expect(prompt?.text).toContain('- jim (engineer, codex): running, 1 open task')
    expect(prompt?.text).toContain('- pam (engineer, codex): not running')
    expect(prompt?.text).toContain('its own git worktree and branch')
    expect(prompt?.text).toContain(
      `orca team task add --team ${team.id} --goal pla-2 --title "<short title>"`
    )
    expect(prompt?.text).toContain(`orca team goal close --team ${team.id} --goal pla-2`)
    expect((await activity()).events.at(-1)).toMatchObject({
      kind: 'goal_created',
      task_ref: 'pla-2',
      from: { party: 'operator' }
    })
  })

  it('tells the manager of a folder project to split by path, with no merge', async () => {
    repoKind = 'folder'
    await call('orchestration.teamGoalCreate', { team: team.id, title: 'Tidy the docs' })
    const text = queued('michael', 'goal')[0]?.text ?? ''
    expect(text).toContain('every member works in the same folder')
    expect(text).toContain('Split the work by path')
    expect(text).toContain('there is nothing to merge')
    expect(text).not.toContain('worktree')
  })

  it('lets the manager file its own goal, and refuses members and teams that cannot plan one', async () => {
    attestedHandle = 'term_jim'
    await expect(
      call('orchestration.teamGoalCreate', { team: team.id, title: 'Mine' })
    ).rejects.toThrow(/only the manager or the operator/)
    attestedHandle = 'term_mgr'
    await expect(
      call('orchestration.teamGoalCreate', { team: team.id, title: 'From a webhook' })
    ).resolves.toMatchObject({ ref: 'pla-1', queued: false })
    expect(queued('michael', 'goal')).toHaveLength(0)
    expect((await activity()).events.at(-1)).toMatchObject({
      kind: 'goal_created',
      from: { party: 'member', member_id: member('michael').id }
    })

    attestedHandle = null
    db.updateTeam(team.id, { status: 'paused' })
    await expect(
      call('orchestration.teamGoalCreate', { team: team.id, title: 'While paused' })
    ).rejects.toThrow(/paused/)
    db.updateTeam(team.id, { status: 'active' })
    db.archiveTeamMember(member('michael').id)
    await expect(
      call('orchestration.teamGoalCreate', { team: team.id, title: 'No manager' })
    ).rejects.toThrow(/no manager/)
    expect(db.listTasks({ runId: team.run_id })).toHaveLength(1)
  })

  it('files a task under a goal with an owner and dependencies, as the manager', async () => {
    await call('orchestration.teamGoalCreate', { team: team.id, title: 'Ship v2' })
    attestedHandle = 'term_mgr'
    const schema = await call('orchestration.teamTaskCreate', {
      team: team.id,
      title: 'Schema',
      goal: 'pla-1',
      assignee: 'jim'
    })
    expect(schema).toMatchObject({
      ref: 'pla-2',
      assignment: { member: 'jim', assigned: true, started: true }
    })
    const handlers = await call('orchestration.teamTaskCreate', {
      team: team.id,
      title: 'Handlers',
      spec: 'Implement the handlers',
      goal: 'pla-1',
      assignee: 'pam',
      deps: ['pla-2']
    })
    expect(handlers).toMatchObject({
      ref: 'pla-3',
      assignment: { member: 'pam', started: false, waiting: 'deps' }
    })
    const goalId = db.resolveTeamTaskRef(team.id, 'pla-1')
    const child = db.getTask(Created.parse(handlers).taskId)
    expect(child).toMatchObject({ parent_id: goalId, status: 'pending' })
    expect(JSON.parse(child?.deps ?? '[]')).toEqual([Created.parse(schema).taskId])
    expect(
      (await activity()).events.filter((event) => event.kind === 'task_created')
    ).toMatchObject([
      { task_ref: 'pla-2', goal_id: goalId, from: { member_id: member('michael').id } },
      { task_ref: 'pla-3', goal_id: goalId }
    ])

    attestedHandle = 'term_jim'
    await expect(
      call('orchestration.teamTaskCreate', { team: team.id, title: 'Sneaky' })
    ).rejects.toThrow(/only the manager or the operator/)
  })

  it('creates nothing when the goal, owner, or a dependency is refused', async () => {
    await call('orchestration.teamGoalCreate', { team: team.id, title: 'Ship v2' })
    await addTask({ title: 'Plain' })
    const refused: [Record<string, unknown>, RegExp][] = [
      [{ assignee: 'nobody' }, /was not found/],
      [{ assignee: 'michael' }, /manager coordinates/],
      [{ deps: ['pla-1'] }, /is a goal/],
      [{ deps: ['pla-99'] }, /is not on team/],
      [{ goal: 'pla-2' }, /is not a goal/],
      [{ enrich: true, assignee: 'jim' }, /--enrich hands the request to the manager/]
    ]
    for (const [params, message] of refused) {
      await expect(
        call('orchestration.teamTaskCreate', { team: team.id, title: 'Refused', ...params })
      ).rejects.toThrow(message)
    }
    expect(db.listTasks({ runId: team.run_id })).toHaveLength(2)

    await call('orchestration.teamTaskCreate', { team: team.id, title: 'Rough ask', enrich: true })
    expect(queued('michael', 'enrich')[0]?.text).toContain(
      `orca team task add --team ${team.id} --title "<title>" --spec "<spec>" --assignee <slug>`
    )
  })

  it('runs a goal: the second task starts when the first settles, one review, then closed', async () => {
    await call('orchestration.teamGoalCreate', { team: team.id, title: 'Ship v2' })
    const goalId = db.resolveTeamTaskRef(team.id, 'pla-1')
    const schema = await addTask({ title: 'Schema', goal: 'pla-1', assignee: 'jim' })
    const handlers = await addTask({
      title: 'Handlers',
      goal: 'pla-1',
      assignee: 'pam',
      deps: [schema.ref]
    })
    const scheduler = teamWorkSchedulerFor(runtime)
    await scheduler.tick()
    expect(db.getTask(schema.taskId)?.status).toBe('dispatched')
    expect(db.getTask(handlers.taskId)?.status).toBe('pending')
    await expect(call('orchestration.teamShow', { team: team.id })).resolves.toMatchObject({
      members: [
        { slug: 'michael', waiting_reason: null },
        { slug: 'jim', current_task: { ref: 'pla-2' }, waiting_reason: null },
        { slug: 'pam', current_task: null, waiting_reason: 'deps' }
      ],
      goals: [{ id: goalId, ref: 'pla-1', title: 'Ship v2', status: 'open' }]
    })

    db.updateTaskStatus(schema.taskId, 'completed', 'Schema merged')
    await scheduler.tick()
    expect(startWorker).toHaveBeenCalledTimes(2)
    expect(startWorker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: {
          task: handlers.taskId,
          from: 'term_mgr',
          terminal: 'term_pam',
          worktree: 'id:wt_pam'
        }
      })
    )
    expect(queued('michael', 'goal-review')).toHaveLength(0)

    db.updateTaskStatus(handlers.taskId, 'completed', 'Handlers done')
    await scheduler.tick()
    await scheduler.tick()
    expect(queued('michael', 'goal-review').map((item) => item.text.split('\n')[0])).toEqual([
      'REVIEW GOAL pla-1: Ship v2'
    ])
    await expect(call('orchestration.teamShow', { team: team.id })).resolves.toMatchObject({
      goals: [{ ref: 'pla-1', status: 'open', progress: { done: 2, total: 2 } }]
    })

    attestedHandle = 'term_mgr'
    await expect(
      call('orchestration.teamGoalClose', { team: team.id, goal: 'pla-1', summary: 'v2 shipped' })
    ).resolves.toEqual({
      goalId,
      ref: 'pla-1',
      status: 'completed',
      cancelledTasks: 0,
      runningTasks: 0
    })
    await expect(
      call('orchestration.teamGoalClose', { team: team.id, goal: 'pla-1' })
    ).rejects.toThrow(/already closed/)
    // Nothing about a closed goal is left for the manager to be asked.
    expect(db.listPendingTeamQueue(member('michael').id)).toHaveLength(0)
    const feed = await activity()
    expect(feed.events.filter((event) => event.kind.startsWith('goal_'))).toMatchObject([
      { kind: 'goal_created', task_ref: 'pla-1', from: { party: 'operator' } },
      { kind: 'goal_review', task_ref: 'pla-1', status: 'requested', goal_id: goalId },
      {
        kind: 'goal_closed',
        task_ref: 'pla-1',
        status: 'completed',
        body_preview: 'v2 shipped',
        from: { party: 'member', member_id: member('michael').id },
        to: { party: 'operator' }
      }
    ])
    await expect(call('orchestration.teamShow', { team: team.id })).resolves.toMatchObject({
      goals: [{ ref: 'pla-1', status: 'completed' }],
      activity_sequence: feed.latestSequence
    })
  })

  it('refuses to close a goal with unfinished tasks, and cancel stops what has not started', async () => {
    await call('orchestration.teamGoalCreate', { team: team.id, title: 'Ship v2' })
    const running = await addTask({ title: 'Running', goal: 'pla-1', assignee: 'jim' })
    const waiting = await addTask({
      title: 'Waiting',
      goal: 'pla-1',
      assignee: 'pam',
      deps: [running.ref]
    })
    // A supervised worker holds its task; only its own lifecycle settles it.
    const supervised = await addTask({ title: 'Supervised', goal: 'pla-1' })
    db.createStartingWorkerDispatch({
      taskId: supervised.taskId,
      startOptions: {},
      creator: { kind: 'system' },
      maxDepth: Number.MAX_SAFE_INTEGER
    })
    await expect(
      call('orchestration.teamGoalClose', { team: team.id, goal: 'pla-1' })
    ).rejects.toThrow(/still has 3 unfinished task\(s\)/)

    await expect(
      call('orchestration.teamGoalClose', { team: team.id, goal: 'pla-1', cancel: true })
    ).resolves.toMatchObject({ status: 'cancelled', cancelledTasks: 2, runningTasks: 1 })
    expect(db.getTask(waiting.taskId)?.status).toBe('failed')
    expect(db.getTeamTaskMeta(waiting.taskId)?.assignee_member_id).toBeNull()
    expect(db.getTask(supervised.taskId)?.status).toBe('dispatched')
    expect(queued('michael', 'goal')).toHaveLength(0)
    await teamWorkSchedulerFor(runtime).tick()
    expect(startWorker).toHaveBeenCalledTimes(1)
    expect((await activity()).events.at(-1)).toMatchObject({
      kind: 'goal_closed',
      status: 'cancelled',
      from: { party: 'operator' }
    })
    await expect(call('orchestration.teamShow', { team: team.id })).resolves.toMatchObject({
      goals: [{ ref: 'pla-1', status: 'cancelled' }]
    })
    await expect(
      call('orchestration.teamTaskCreate', { team: team.id, title: 'Late', goal: 'pla-1' })
    ).rejects.toThrow(/is closed/)
  })

  it('names the member behind each pending question and gate', async () => {
    const task = await addTask({ title: 'Pick a database', assignee: 'jim' })
    const dispatch = db.getDispatchContext(task.taskId)
    const { question } = db.createQuestion({
      runId: team.run_id,
      dispatchId: dispatch?.id ?? '',
      askerHandle: 'term_jim',
      question: 'Postgres or SQLite?'
    })
    const schema = await addTask({ title: 'Schema', assignee: 'pam' })
    const gate = db.createGate({ taskId: schema.taskId, question: 'Approve the schema?' })
    const unowned = db.createTask({ runId: team.run_id, spec: 'Budget' })
    const managerGate = db.createGate({ taskId: unowned.id, question: 'Spend more?' })
    await expect(call('orchestration.teamShow', { team: team.id })).resolves.toMatchObject({
      pendingQuestions: [{ message_id: question.message_id, asker_member_id: member('jim').id }],
      pendingGates: [
        { id: gate.id, task_ref: 'pla-2', member_id: member('pam').id },
        { id: managerGate.id, task_ref: 'pla-3', member_id: member('michael').id }
      ]
    })
  })

  it('sets and clears the team parallel limit', async () => {
    await call('orchestration.teamUpdate', { team: team.id, maxParallel: 1 })
    expect(db.requireTeam(team.id).max_parallel).toBe(1)
    await addTask({ title: 'A', assignee: 'jim' })
    await expect(
      call('orchestration.teamTaskCreate', { team: team.id, title: 'B', assignee: 'pam' })
    ).resolves.toMatchObject({ assignment: { started: false, waiting: 'team_at_capacity' } })
    await call('orchestration.teamUpdate', { team: team.id, charter: 'Ship it' })
    expect(db.requireTeam(team.id).max_parallel).toBe(1)
    await call('orchestration.teamUpdate', { team: team.id, maxParallel: null })
    expect(db.requireTeam(team.id).max_parallel).toBeNull()
  })
})
