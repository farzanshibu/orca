import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrchestrationCompatibilityEvidence } from '../../../shared/orchestration-compatibility-evidence'
import { OrchestrationDb } from '../orchestration/db'
import type { TeamRow } from '../orchestration/team-types'
import { OrcaRuntimeService } from '../orca-runtime'
import {
  requireNoTeamMemberCaller,
  requireTeamOperator,
  requireTeamOperatorOrManager,
  resolveTeamCaller,
  teamCallerParticipant,
  type TeamCaller
} from './team-caller-authority'

const JIM_PANE = 'tab_jim:22222222-2222-4222-8222-222222222222'

describe('team caller authority', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let team: TeamRow
  /** The pane the runtime vouches for, whatever the request claims. */
  let attested: { terminalHandle: string; paneKey: string } | null

  function context(evidence?: OrchestrationCompatibilityEvidence) {
    return { runtime, orchestrationCompatibilityEvidence: evidence }
  }

  function caller(evidence?: OrchestrationCompatibilityEvidence): Promise<TeamCaller> {
    return resolveTeamCaller(context(evidence), db, team)
  }

  function addMember(teamId: string, slug: string, handle: string, paneKey: string | null) {
    const row = db.addTeamMember(teamId, {
      slug,
      roleSlug: 'engineer',
      agent: 'claude',
      isManager: slug === 'michael'
    })
    return db.bindTeamMemberTerminal(row.id, {
      worktreeId: `wt_${slug}`,
      terminalHandle: handle,
      paneKey
    })
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    attested = null
    team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    addMember(team.id, 'michael', 'term_mgr', null)
    addMember(team.id, 'jim', 'term_jim', JIM_PANE)
    addMember(db.createTeam({ repoId: 'repo_1', name: 'Sales' }).id, 'dwight', 'term_dwight', null)
    vi.spyOn(runtime, 'verifyOrchestrationCompatibilityCaller').mockImplementation(() =>
      attested
        ? {
            hostScope: { kind: 'local', hostId: 'local' },
            processIncarnation: 'p1',
            launchTokenHash: 'h',
            ...attested
          }
        : null
    )
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('reads a caller with no pane evidence as the operator', async () => {
    await expect(caller()).resolves.toEqual({ kind: 'operator' })
    // A plain SSH shell is stamped with its host; that names a machine, not a pane.
    await expect(
      caller({
        host: { kind: 'ssh', targetId: 't', connectionIncarnation: 'c', attachmentId: 'a' }
      })
    ).resolves.toEqual({ kind: 'operator' })
  })

  it.each<[string, OrchestrationCompatibilityEvidence]>([
    ['a member pane with a wrong token', { terminalHandle: 'term_jim', paneKey: JIM_PANE }],
    ['a handle whose token the harness scrubbed', { terminalHandle: 'term_jim' }],
    ['a pane key alone', { paneKey: JIM_PANE }],
    ['a launch token alone', { launchToken: 'stolen' }],
    ['a chat session', { agentSessionId: 'session_1' }]
  ])('reads evidence that does not verify as an agent: %s', async (_label, evidence) => {
    await expect(caller(evidence)).resolves.toEqual({ kind: 'agent' })
  })

  it('reads a verified member pane as that member', async () => {
    attested = { terminalHandle: 'term_jim', paneKey: JIM_PANE }
    await expect(caller()).resolves.toMatchObject({
      kind: 'member',
      member: { slug: 'jim' },
      isManager: false
    })
    attested = { terminalHandle: 'term_mgr', paneKey: 'tab_mgr:leaf' }
    await expect(caller()).resolves.toMatchObject({ kind: 'member', isManager: true })
    // A reissued handle is still the member's pane.
    attested = { terminalHandle: 'term_reissued', paneKey: JIM_PANE }
    await expect(caller()).resolves.toMatchObject({ kind: 'member', member: { slug: 'jim' } })
    expect(runtime.verifyOrchestrationCompatibilityCaller).toHaveBeenLastCalledWith(undefined, {
      currentRuntimeLaunchSufficient: true
    })
  })

  it('reads a verified pane that is not on the roster as an agent', async () => {
    // A member's own sub-worker: attested, launched by Orca, and still not the member.
    attested = { terminalHandle: 'term_sub_worker', paneKey: 'tab_sub:leaf' }
    await expect(caller()).resolves.toEqual({ kind: 'agent' })
    // A member of another team has no standing on this one.
    attested = { terminalHandle: 'term_dwight', paneKey: 'tab_dwight:leaf' }
    await expect(caller()).resolves.toEqual({ kind: 'agent' })
  })

  it('gives an agent no team authority and names it as an agent on the feed', async () => {
    const agent: TeamCaller = { kind: 'agent' }
    expect(() => requireTeamOperator(agent, 'stop members')).toThrow(
      /This terminal cannot stop members; only the human operator can/
    )
    expect(() => requireTeamOperatorOrManager(agent, 'assign tasks')).toThrow(
      /only the manager or the operator can/
    )
    expect(teamCallerParticipant(agent)).toEqual({ party: 'agent' })
    expect(teamCallerParticipant({ kind: 'operator' })).toEqual({ party: 'operator' })
  })

  it('keeps the manager below the operator and a member below the manager', async () => {
    attested = { terminalHandle: 'term_mgr', paneKey: 'tab_mgr:leaf' }
    const manager = await caller()
    expect(() => requireTeamOperatorOrManager(manager, 'assign tasks')).not.toThrow()
    expect(() => requireTeamOperator(manager, 'stop members')).toThrow(/Team member michael/)
    attested = { terminalHandle: 'term_jim', paneKey: JIM_PANE }
    const member = await caller()
    expect(() => requireTeamOperatorOrManager(member, 'assign tasks')).toThrow(
      /Team member jim cannot assign tasks/
    )
  })

  it('lets only the operator act outside any one team', async () => {
    await expect(requireNoTeamMemberCaller(context(), db, 'create teams')).resolves.toBeUndefined()
    await expect(
      requireNoTeamMemberCaller(context({ terminalHandle: 'term_x' }), db, 'create teams')
    ).rejects.toMatchObject({ code: 'consumer_fenced' })
    attested = { terminalHandle: 'term_sub_worker', paneKey: 'tab_sub:leaf' }
    await expect(requireNoTeamMemberCaller(context(), db, 'create teams')).rejects.toThrow(
      /This terminal cannot create teams/
    )
    attested = { terminalHandle: 'term_dwight', paneKey: 'tab_dwight:leaf' }
    await expect(requireNoTeamMemberCaller(context(), db, 'create teams')).rejects.toThrow(
      /Team member dwight cannot create teams/
    )
  })
})
