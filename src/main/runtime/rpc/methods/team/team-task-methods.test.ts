import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Repo } from '../../../../../shared/repo-types'
import { OrchestrationDb } from '../../../orchestration/db'
import type { TeamRow } from '../../../orchestration/team-types'
import { OrcaRuntimeService } from '../../../orca-runtime'
import { eraseRpcMethods } from '../../core'
import { ORCHESTRATION_TEAM_METHODS } from '.'

const startWorker = vi.hoisted(() => vi.fn())
vi.mock('../orchestration/worker/worker-start-for-run', () => ({ startWorkerForRun: startWorker }))

const MANAGER_PANE = 'tab_mgr:11111111-1111-4111-8111-111111111111'
const JIM_PANE = 'tab_jim:22222222-2222-4222-8222-222222222222'

describe('team task assignment', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let attestedHandle: string | null
  let team: TeamRow
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

  function member(slug: string) {
    return db.resolveTeamMemberSelector(team.id, slug)
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    attestedHandle = null
    livePanes.clear()
    startWorker.mockReset()
    startWorker.mockImplementation(async () => ({ dispatchId: 'ctx_new', state: 'ready' }))
    const repo: Repo = {
      id: 'repo_1',
      path: '/repo',
      displayName: 'repo',
      badgeColor: '#000',
      addedAt: 0,
      kind: 'git'
    }
    vi.spyOn(runtime, 'showRepo').mockResolvedValue(repo)
    vi.spyOn(runtime, 'getLiveTerminalPaneKey').mockImplementation(
      (handle) => livePanes.get(handle) ?? null
    )
    vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation(
      (handle) => livePanes.get(handle) ?? null
    )
    vi.spyOn(runtime, 'getTerminalHandleForPaneKey').mockReturnValue(null)
    vi.spyOn(runtime, 'verifyOrchestrationCompatibilityCaller').mockImplementation(() =>
      attestedHandle
        ? {
            hostScope: { kind: 'local', hostId: 'local' },
            terminalHandle: attestedHandle,
            paneKey: livePanes.get(attestedHandle) ?? '',
            processIncarnation: 'p1',
            launchTokenHash: 'h'
          }
        : null
    )

    team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const michael = db.addTeamMember(team.id, {
      slug: 'michael',
      roleSlug: 'manager',
      agent: 'claude',
      isManager: true
    })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(michael.id, {
      worktreeId: 'wt_m',
      terminalHandle: 'term_mgr',
      paneKey: MANAGER_PANE
    })
    db.bindTeamMemberTerminal(jim.id, {
      worktreeId: 'wt_j',
      terminalHandle: 'term_jim',
      paneKey: JIM_PANE
    })
    db.setTeamMemberDesiredState(jim.id, 'running')
    livePanes.set('term_mgr', MANAGER_PANE)
    livePanes.set('term_jim', JIM_PANE)
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it("starts the task in the member's own terminal and worktree, as the manager", async () => {
    const task = db.createTask({ runId: team.run_id, spec: 'Build the API' })
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-1', member: 'jim' })
    ).resolves.toMatchObject({ ref: 'pla-1', member: 'jim', started: true, dispatchId: 'ctx_new' })
    expect(startWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          task: task.id,
          from: 'term_mgr',
          terminal: 'term_jim',
          worktree: 'id:wt_j'
        }
      })
    )
    // The manager became the team Run's coordinator so the dispatch lands in the team's history.
    expect(db.getRun(team.run_id)?.coordinator_handle).toBe('term_mgr')
    expect(db.getTeamTaskMeta(task.id)?.assignee_member_id).toBe(member('jim').id)
  })

  it('records the assignment and waits while the task or member cannot start', async () => {
    const first = db.createTask({ runId: team.run_id, spec: 'Schema' })
    db.createTask({ runId: team.run_id, spec: 'Handlers', deps: [first.id] })
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-2', member: 'jim' })
    ).resolves.toMatchObject({ started: false, waiting: 'deps' })

    db.setTeamMemberPaused(member('jim').id, true, 'operator')
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-1', member: 'jim' })
    ).resolves.toMatchObject({ started: false, waiting: 'member_paused' })
    db.setTeamMemberPaused(member('jim').id, false)

    // Busy until its current Dispatch settles.
    db.createDispatchContext({
      taskId: first.id,
      assigneeHandle: 'term_jim',
      assigneePaneKey: JIM_PANE,
      creator: { kind: 'system' },
      maxDepth: Number.MAX_SAFE_INTEGER
    })
    const third = db.createTask({ runId: team.run_id, spec: 'Docs' })
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: third.id, member: 'jim' })
    ).resolves.toMatchObject({ started: false, waiting: 'member_busy' })
    expect(startWorker).not.toHaveBeenCalled()
    expect(db.getTeamTaskMeta(third.id)?.assignee_member_id).toBe(member('jim').id)
  })

  it('tells a lost terminal from a stopped member, and waits for the manager', async () => {
    db.createTask({ runId: team.run_id, spec: 'Build' })
    livePanes.delete('term_jim')
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-1', member: 'jim' })
    ).resolves.toMatchObject({ waiting: 'member_unverifiable' })
    db.setTeamMemberDesiredState(member('jim').id, 'stopped')
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-1', member: 'jim' })
    ).resolves.toMatchObject({ waiting: 'member_not_running' })

    livePanes.set('term_jim', JIM_PANE)
    livePanes.delete('term_mgr')
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-1', member: 'jim' })
    ).resolves.toMatchObject({ waiting: 'manager_not_running' })
  })

  it('refuses goals, the manager as assignee, and non-manager members as callers', async () => {
    const goal = db.createTask({ runId: team.run_id, spec: 'Ship v2' })
    db.markTeamTaskKind(team.id, goal.id, 'goal')
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: goal.id, member: 'jim' })
    ).rejects.toThrow(/goal/)
    db.createTask({ runId: team.run_id, spec: 'Build' })
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-2', member: 'michael' })
    ).rejects.toThrow(/manager coordinates/)
    attestedHandle = 'term_jim'
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-2', member: 'jim' })
    ).rejects.toThrow(/only the manager or the operator/)
    attestedHandle = 'term_mgr'
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-2', member: 'jim' })
    ).resolves.toMatchObject({ started: true })
  })

  it('puts assignments and direct sends in the activity feed with who made them', async () => {
    db.createTask({ runId: team.run_id, spec: 'Build the API', taskTitle: 'API' })
    await call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-1', member: 'jim' })
    vi.spyOn(runtime, 'sendTerminalAgentPrompt').mockResolvedValue({
      handle: 'term_jim',
      accepted: true,
      bytesWritten: 1
    })
    attestedHandle = 'term_mgr'
    await call('orchestration.teamMemberSend', {
      team: team.id,
      member: 'jim',
      text: ['Check the migration first', 'then the handlers'].join('\n')
    })
    const page = await call('orchestration.teamActivity', { team: team.id })
    expect(page).toMatchObject({ reset: false, hasMore: false })
    const events = z
      .object({ events: z.array(z.unknown()) })
      .parse(page)
      .events.slice(-2)
    expect(events).toMatchObject([
      {
        kind: 'task_assigned',
        task_ref: 'pla-1',
        subject: 'API',
        from: { party: 'operator' },
        to: { member_ids: [member('jim').id] }
      },
      {
        kind: 'delivery',
        channel: 'direct',
        subject: 'Check the migration first',
        from: { party: 'member', member_id: member('michael').id },
        to: { member_ids: [member('jim').id] }
      }
    ])
  })

  it('reports a start that failed and unassigns on request', async () => {
    db.createTask({ runId: team.run_id, spec: 'Build' })
    startWorker.mockResolvedValue({ dispatchId: 'ctx_bad', state: 'failed', lastError: 'boom' })
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-1', member: 'jim' })
    ).resolves.toMatchObject({ started: false, error: 'boom', dispatchId: 'ctx_bad' })
    await expect(
      call('orchestration.teamTaskAssign', { team: team.id, task: 'pla-1', unassign: true })
    ).resolves.toMatchObject({ member: null, started: false })
    expect(db.listTeamTaskMeta(team.id)[0]?.assignee_member_id).toBeNull()
  })
})
