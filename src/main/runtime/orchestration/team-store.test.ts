import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from './db'
import { SCHEMA_VERSION } from './db/contract-constants'

describe('team store', () => {
  let db: OrchestrationDb

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('creates a team backed by its own coordinator-less Run', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform', charter: ' Ship it ' })
    expect(team.status).toBe('active')
    expect(team.charter).toBe('Ship it')
    const run = db.getRun(team.run_id)
    expect(run?.coordinator_handle).toBeNull()
    expect(db.getTeamByRunId(team.run_id)?.id).toBe(team.id)
  })

  it('keeps team names unique per repo but not across repos', () => {
    db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    expect(() => db.createTeam({ repoId: 'repo_1', name: 'Platform' })).toThrow(/already exists/)
    expect(db.createTeam({ repoId: 'repo_2', name: 'Platform' }).repo_id).toBe('repo_2')
  })

  it('frees a name once its team is archived', () => {
    const first = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    db.updateTeam(first.id, { status: 'archived' })
    expect(db.createTeam({ repoId: 'repo_1', name: 'Platform' }).id).not.toBe(first.id)
    expect(() => db.updateTeam(first.id, { status: 'active' })).toThrow(/archived/)
  })

  it('resolves a team by id or by name, refusing an ambiguous name', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    db.createTeam({ repoId: 'repo_2', name: 'Platform' })
    expect(db.resolveTeamSelector(team.id).id).toBe(team.id)
    expect(db.resolveTeamSelector('Platform', 'repo_1').id).toBe(team.id)
    expect(() => db.resolveTeamSelector('Platform')).toThrow(/several repositories/)
    expect(() => db.resolveTeamSelector('Nope')).toThrow(/not found/)
  })

  it('allows one manager per team and unique member slugs', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const manager = db.addTeamMember(team.id, {
      slug: 'michael',
      roleSlug: 'manager',
      agent: 'claude',
      model: 'opus',
      isManager: true
    })
    expect(manager.display_name).toBe('michael')
    expect(() =>
      db.addTeamMember(team.id, {
        slug: 'jan',
        roleSlug: 'manager',
        agent: 'codex',
        isManager: true
      })
    ).toThrow(/already has a manager/)
    expect(() =>
      db.addTeamMember(team.id, { slug: 'michael', roleSlug: 'x', agent: 'codex' })
    ).toThrow(/already has a member/)
    expect(() =>
      db.addTeamMember(team.id, { slug: 'Bad Slug', roleSlug: 'x', agent: 'codex' })
    ).toThrow(/lowercase/)
    db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    expect(db.listTeamMembers(team.id).map((member) => member.slug)).toEqual(['michael', 'jim'])
    expect(db.getTeamManager(team.id)?.id).toBe(manager.id)
  })

  it('frees a slug and the manager seat when a member is archived', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const manager = db.addTeamMember(team.id, {
      slug: 'michael',
      roleSlug: 'manager',
      agent: 'claude',
      isManager: true
    })
    db.archiveTeamMember(manager.id)
    expect(db.getTeamManager(team.id)).toBeUndefined()
    expect(db.listTeamMembers(team.id)).toHaveLength(0)
    expect(
      db.addTeamMember(team.id, {
        slug: 'michael',
        roleSlug: 'manager',
        agent: 'claude',
        isManager: true
      }).id
    ).not.toBe(manager.id)
  })

  it('tracks terminal binding, pause, and desired state', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const member = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(member.id, {
      worktreeId: 'wt_1',
      terminalHandle: 'term_1',
      paneKey: 'tab_1:leaf_1'
    })
    expect(db.findTeamMemberByTerminal('term_1')?.id).toBe(member.id)
    expect(db.setTeamMemberPaused(member.id, true).paused_at).not.toBeNull()
    expect(db.setTeamMemberPaused(member.id, false).paused_at).toBeNull()
    expect(db.setTeamMemberDesiredState(member.id, 'running').desired_state).toBe('running')
    expect(db.resolveTeamMemberSelector(team.id, 'jim').id).toBe(member.id)
  })

  it('adds the member atomically when a hire proposal is approved', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const proposal = db.createTeamHireProposal(team.id, {
      slug: 'dwight',
      roleSlug: 'reviewer',
      agent: 'gemini',
      rationale: 'Need a second reviewer'
    })
    const { proposal: settled, member } = db.decideTeamHireProposal(proposal.id, 'approved')
    expect(settled.status).toBe('approved')
    expect(settled.member_id).toBe(member?.id)
    expect(member?.role_slug).toBe('reviewer')
    expect(() => db.decideTeamHireProposal(proposal.id, 'rejected')).toThrow(/already approved/)
  })

  it('leaves a proposal pending when approval conflicts with an existing member', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const proposal = db.createTeamHireProposal(team.id, {
      slug: 'dwight',
      roleSlug: 'reviewer',
      agent: 'gemini'
    })
    db.addTeamMember(team.id, { slug: 'dwight', roleSlug: 'reviewer', agent: 'codex' })
    expect(() => db.decideTeamHireProposal(proposal.id, 'approved')).toThrow(/already has a member/)
    expect(db.requireTeamHireProposal(proposal.id).status).toBe('pending')
    expect(db.decideTeamHireProposal(proposal.id, 'rejected', 'dup').proposal.decision_note).toBe(
      'dup'
    )
  })

  it('clears teams on a full reset', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.resetAll()
    expect(db.listTeams()).toHaveLength(0)
    expect(db.getTeamMember('jim')).toBeUndefined()
  })
})

describe('team schema migration', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-team-migration-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('adds team tables to a v42 database', () => {
    const path = join(dir, 'orchestration.db')
    const seeded = new OrchestrationDb(path)
    seeded.db.exec('DROP TABLE teams; DROP TABLE team_members; DROP TABLE team_hire_proposals;')
    seeded.db.pragma('user_version = 42')
    seeded.close()

    const reopened = new OrchestrationDb(path)
    try {
      expect(reopened.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
      expect(SCHEMA_VERSION).toBe(45)
      expect(reopened.createTeam({ repoId: 'repo_1', name: 'Platform' }).status).toBe('active')
    } finally {
      reopened.close()
    }
  })

  it('adds assignment, queue sources, and the activity feed to a v43 database', () => {
    const path = join(dir, 'orchestration.db')
    const seeded = new OrchestrationDb(path)
    seeded.db.exec(`
      DROP TABLE team_activity;
      DROP INDEX idx_team_task_refs_assignee;
      DROP TABLE team_task_refs;
      CREATE TABLE team_task_refs (
        task_id TEXT PRIMARY KEY, team_id TEXT NOT NULL, number INTEGER NOT NULL,
        UNIQUE (team_id, number)
      );
      ALTER TABLE teams DROP COLUMN max_parallel;
      ALTER TABLE teams DROP COLUMN activity_pruned_through;
      ALTER TABLE team_member_queue DROP COLUMN source;
      ALTER TABLE team_members ADD COLUMN current_dispatch_id TEXT;
    `)
    seeded.db.pragma('user_version = 43')
    seeded.close()

    const reopened = new OrchestrationDb(path)
    try {
      expect(reopened.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
      for (const [table, column] of [
        ['teams', 'activity_pruned_through'],
        ['team_task_refs', 'assignee_member_id'],
        ['team_member_queue', 'source'],
        ['team_activity', 'sequence']
      ] as const) {
        expect(reopened.hasColumn(table, column)).toBe(true)
      }
      // Never written in v43; a member's current task is read from its active Dispatch.
      expect(reopened.hasColumn('team_members', 'current_dispatch_id')).toBe(false)
      const team = reopened.createTeam({ repoId: 'repo_1', name: 'Platform' })
      const member = reopened.addTeamMember(team.id, {
        slug: 'jim',
        roleSlug: 'engineer',
        agent: 'codex'
      })
      const task = reopened.createTask({ runId: team.run_id, spec: 'Ship it' })
      const meta = reopened.assignTeamTask(team.id, task.id, member.id)
      expect(meta).toMatchObject({ kind: 'task', assignee_member_id: member.id, number: 1 })
    } finally {
      reopened.close()
    }
  })

  it('adds start retries and the goal index to a v44 database, keeping its assignments', () => {
    const path = join(dir, 'orchestration.db')
    const seeded = new OrchestrationDb(path)
    const team = seeded.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const member = seeded.addTeamMember(team.id, {
      slug: 'jim',
      roleSlug: 'engineer',
      agent: 'codex'
    })
    const task = seeded.createTask({ runId: team.run_id, spec: 'Ship it' })
    seeded.assignTeamTask(team.id, task.id, member.id)
    seeded.db.exec(`
      DROP INDEX idx_team_task_refs_goal;
      ALTER TABLE team_task_refs DROP COLUMN start_failures;
      ALTER TABLE team_task_refs DROP COLUMN retry_at;
      ALTER TABLE team_task_refs DROP COLUMN escalated_at;
      ALTER TABLE team_task_refs DROP COLUMN counted_dispatch_id;
    `)
    seeded.db.pragma('user_version = 44')
    seeded.close()

    const reopened = new OrchestrationDb(path)
    try {
      expect(reopened.db.pragma('user_version', { simple: true })).toBe(45)
      expect(
        reopened.db
          .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?")
          .get('idx_team_task_refs_goal')
      ).toBeDefined()
      expect(reopened.getTeamTaskMeta(task.id)).toMatchObject({
        assignee_member_id: member.id,
        start_failures: 0,
        retry_at: null,
        escalated_at: null,
        counted_dispatch_id: null
      })
      // The scheduler's query reads the new columns, so it must run on a migrated database.
      expect(reopened.listStartableTeamTasks().map((row) => row.task_id)).toEqual([task.id])
      reopened.recordTeamTaskStartFailure(task.id, {
        retryAt: '2026-10-01T10:01:00.000Z',
        escalated: false,
        dispatchId: null
      })
      expect(reopened.getTeamTaskMeta(task.id)).toMatchObject({
        start_failures: 1,
        retry_at: '2026-10-01T10:01:00.000Z'
      })
    } finally {
      reopened.close()
    }
  })
})
