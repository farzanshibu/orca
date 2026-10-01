import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { OrchestrationDb } from '../../../orchestration/db'
import { OrcaRuntimeService } from '../../../orca-runtime'
import { eraseRpcMethods } from '../../core'
import { ORCHESTRATION_TEAM_METHODS } from '.'

const deliverPrompt = vi.hoisted(() => vi.fn())
vi.mock('../agent-launch-terminal-prompt', () => ({
  deliverTerminalAgentLaunchPrompt: deliverPrompt
}))
vi.mock('../../../../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ isPackaged: () => true })
}))

function worktreeFixture(id: string, path: string): Worktree {
  return {
    id,
    repoId: 'repo_1',
    path,
    head: 'abc',
    branch: `refs/heads/${id}`,
    isBare: false,
    isMainWorktree: false,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

const MANAGER_PANE = 'tab_mgr:11111111-1111-4111-8111-111111111111'
const WORKER_PANE = 'tab_jim:22222222-2222-4222-8222-222222222222'

describe('orchestration team methods', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let attestedHandle: string | null
  let workspaceRoot: string
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

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    attestedHandle = null
    workspaceRoot = mkdtempSync(join(tmpdir(), 'orca-team-ws-'))
    livePanes.clear()
    deliverPrompt.mockReset()
    deliverPrompt.mockResolvedValue(true)
    const repo: Repo = {
      id: 'repo_1',
      path: join(workspaceRoot, 'repo'),
      displayName: 'repo',
      badgeColor: '#000',
      addedAt: 0,
      kind: 'git'
    }
    vi.spyOn(runtime, 'showRepo').mockResolvedValue(repo)
    vi.spyOn(runtime, 'createManagedWorktree').mockImplementation(async (args) => ({
      worktree: worktreeFixture(`wt_${args.name}`, join(workspaceRoot, args.name))
    }))
    vi.spyOn(runtime, 'showManagedWorktree').mockImplementation(async (selector) => {
      const id = selector.replace('id:', '')
      return worktreeFixture(id, join(workspaceRoot, id))
    })
    vi.spyOn(runtime, 'getLiveTerminalPaneKey').mockImplementation(
      (handle) => livePanes.get(handle) ?? null
    )
    vi.spyOn(runtime, 'getTerminalHandleForPaneKey').mockReturnValue(null)
    vi.spyOn(runtime, 'getAgentStatusForHandle').mockResolvedValue('idle')
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
  })

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true })
    db.close()
    vi.restoreAllMocks()
  })

  async function seedTeam() {
    await call('orchestration.teamCreate', { repo: 'id:repo_1', name: 'Platform' })
    const team = db.resolveTeamSelector('Platform')
    await call('orchestration.teamMemberAdd', {
      team: team.id,
      slug: 'michael',
      role: 'manager',
      agent: 'claude',
      manager: true
    })
    await call('orchestration.teamMemberAdd', {
      team: team.id,
      slug: 'jim',
      role: 'engineer',
      agent: 'codex'
    })
    const michael = db.resolveTeamMemberSelector(team.id, 'michael')
    const jim = db.resolveTeamMemberSelector(team.id, 'jim')
    db.bindTeamMemberTerminal(michael.id, {
      worktreeId: 'wt_m',
      terminalHandle: 'term_mgr',
      paneKey: MANAGER_PANE
    })
    db.bindTeamMemberTerminal(jim.id, {
      worktreeId: 'wt_j',
      terminalHandle: 'term_jim',
      paneKey: WORKER_PANE
    })
    livePanes.set('term_mgr', MANAGER_PANE)
    livePanes.set('term_jim', WORKER_PANE)
    return team
  }

  it('shows members with live status and manager first', async () => {
    const team = await seedTeam()
    await expect(call('orchestration.teamShow', { team: 'Platform' })).resolves.toMatchObject({
      members: [
        { slug: 'michael', liveness: 'live', agent_status: 'idle' },
        { slug: 'jim', liveness: 'live', agent_status: 'idle' }
      ]
    })
    livePanes.delete('term_jim')
    db.setTeamMemberDesiredState(db.resolveTeamMemberSelector(team.id, 'jim').id, 'running')
    // A running member we cannot find is unverifiable, never claimed exited.
    await expect(call('orchestration.teamShow', { team: team.id })).resolves.toMatchObject({
      members: [{ slug: 'michael' }, { slug: 'jim', liveness: 'unverifiable' }]
    })
  })

  it('refuses operator actions from an attested member terminal', async () => {
    const team = await seedTeam()
    attestedHandle = 'term_jim'
    await expect(
      call('orchestration.teamMemberAdd', { team: team.id, slug: 'pam', role: 'x', agent: 'codex' })
    ).rejects.toThrow(/only the human operator/)
    await expect(
      call('orchestration.teamCreate', { repo: 'id:repo_1', name: 'Shadow' })
    ).rejects.toThrow(/only the human operator/)
    await expect(
      call('orchestration.teamHirePropose', {
        team: team.id,
        slug: 'pam',
        role: 'x',
        agent: 'codex'
      })
    ).rejects.toThrow(/Only the manager/)
  })

  it('lets the manager propose a hire that only the operator can approve', async () => {
    const team = await seedTeam()
    attestedHandle = 'term_mgr'
    await call('orchestration.teamHirePropose', {
      team: team.id,
      slug: 'dwight',
      role: 'reviewer',
      agent: 'gemini',
      rationale: 'second reviewer'
    })
    const [proposal] = db.listTeamHireProposals(team.id, 'pending')
    expect(proposal.proposed_by_member_id).toBe(db.resolveTeamMemberSelector(team.id, 'michael').id)
    await expect(
      call('orchestration.teamHireDecide', { team: team.id, id: proposal.id, decision: 'approve' })
    ).rejects.toThrow(/only the human operator/)

    attestedHandle = null
    await expect(
      call('orchestration.teamHireDecide', { team: team.id, id: proposal.id, decision: 'approve' })
    ).resolves.toMatchObject({
      proposal: { status: 'approved' },
      member: { slug: 'dwight', liveness: 'stopped' }
    })
  })

  it('resolves only gates in the team Run', async () => {
    const team = await seedTeam()
    const task = db.createTask({ spec: 'choose a db', runId: team.run_id })
    const gate = db.createGate({ taskId: task.id, question: 'postgres or sqlite?' })
    const otherRun = db.createRun({
      objective: 'other',
      coordinatorHandle: null,
      coordinatorPaneKey: null
    })
    const otherGate = db.createGate({
      taskId: db.createTask({ spec: 'x', runId: otherRun.id }).id,
      question: 'q'
    })
    await expect(
      call('orchestration.teamGateResolve', { team: team.id, id: otherGate.id, resolution: 'a' })
    ).rejects.toThrow(/not found in team/)
    await expect(call('orchestration.teamShow', { team: team.id })).resolves.toMatchObject({
      pendingGates: [{ id: gate.id }]
    })
    await expect(
      call('orchestration.teamGateResolve', { team: team.id, id: gate.id, resolution: 'sqlite' })
    ).resolves.toMatchObject({ gate: { status: 'resolved' } })
  })

  it('starts a member in a new worktree with its grants and binds its terminal', async () => {
    const team = await seedTeam()
    const pam = db.addTeamMember(team.id, {
      slug: 'pam',
      roleSlug: 'designer',
      agent: 'claude',
      capabilities: {
        skills: ['figma'],
        connections: [],
        mcpServers: [{ name: 'docs', command: 'npx', args: ['docs-mcp'] }]
      }
    })
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue({
      handle: 'term_pam',
      paneKey: 'tab_p:33333333-3333-4333-8333-333333333333',
      worktreeId: 'wt_team-pam',
      title: 'pam'
    })
    await expect(
      call('orchestration.teamMemberStart', { team: team.id, member: 'pam' })
    ).resolves.toMatchObject({ member: { terminal_handle: 'term_pam', desired_state: 'running' } })
    // Always a terminal agent: a structured session has no pane for dispatches to reach.
    expect(createTerminal).toHaveBeenCalledWith(
      'id:wt_team-pam',
      expect.objectContaining({ startupAgent: 'claude', surfaceOwner: false })
    )
    expect(deliverPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: 'term_pam',
        text: expect.stringContaining('Skills to load before working: figma')
      })
    )
    expect(db.getTeamMember(pam.id)?.worktree_id).toBe('wt_team-pam')
    const mcp = JSON.parse(readFileSync(join(workspaceRoot, 'team-pam', '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.docs).toEqual({ command: 'npx', args: ['docs-mcp'] })
    expect(
      readFileSync(join(workspaceRoot, 'repo', '.orca/team/platform/members/pam.md'), 'utf8')
    ).toContain('pam (designer)')
  })

  it('refuses to start members of a paused team and to send to a stopped member', async () => {
    const team = await seedTeam()
    await call('orchestration.teamUpdate', { team: team.id, status: 'paused' })
    await expect(
      call('orchestration.teamMemberStart', { team: team.id, member: 'jim' })
    ).rejects.toThrow(/paused/)
    livePanes.delete('term_jim')
    await expect(
      call('orchestration.teamMemberSend', { team: team.id, member: 'jim', text: 'hi' })
    ).rejects.toThrow(/not running/)
  })

  it('binds a started manager as the team Run coordinator', async () => {
    const team = await seedTeam()
    const michael = db.resolveTeamMemberSelector(team.id, 'michael')
    db.bindTeamMemberTerminal(michael.id, {
      worktreeId: 'wt_m',
      terminalHandle: null,
      paneKey: null
    })
    livePanes.delete('term_mgr')
    const pane = 'tab_m2:44444444-4444-4444-8444-444444444444'
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue({
      handle: 'term_mgr2',
      paneKey: pane,
      worktreeId: 'wt_m',
      title: 'michael'
    })
    await call('orchestration.teamMemberStart', { team: team.id, member: 'michael' })
    expect(db.getRun(team.run_id)).toMatchObject({
      coordinator_handle: 'term_mgr2',
      coordinator_pane_key: pane
    })
    // Restarting in its own worktree keeps the member's branch.
    expect(createTerminal).toHaveBeenCalledWith('id:wt_m', expect.anything())
  })
})
