import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../orchestration/db'
import { assertTeamAcceptsWorkerStart } from './team-work-admission'

describe('assertTeamAcceptsWorkerStart', () => {
  let db: OrchestrationDb

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('refuses new work in a paused team and onto a paused member terminal', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(jim.id, {
      worktreeId: 'wt',
      terminalHandle: 'term_jim',
      paneKey: null
    })
    const run = db.getRun(team.run_id)!
    const other = db.createRun({
      objective: 'x',
      coordinatorHandle: null,
      coordinatorPaneKey: null
    })

    const start = (target: { run: typeof run; terminal: string | undefined }): void =>
      assertTeamAcceptsWorkerStart({ db, ...target, taskId: undefined })
    expect(() => start({ run, terminal: 'term_jim' })).not.toThrow()
    db.setTeamMemberPaused(jim.id, true)
    expect(() => start({ run: other, terminal: 'term_jim' })).toThrow(/jim is paused/)
    expect(() => start({ run: other, terminal: 'term_x' })).not.toThrow()
    db.updateTeam(team.id, { status: 'paused' })
    expect(() => start({ run, terminal: undefined })).toThrow(/Platform is paused/)
  })

  it('refuses to dispatch a goal, and still takes its tasks', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const run = db.getRun(team.run_id)!
    const goal = db.createTask({ runId: team.run_id, spec: 'Ship v2' })
    db.markTeamTaskKind(team.id, goal.id, 'goal')
    const task = db.createTask({ runId: team.run_id, spec: 'Schema', parentId: goal.id })

    expect(() =>
      assertTeamAcceptsWorkerStart({ db, run, terminal: undefined, taskId: goal.id })
    ).toThrow(/goal is split into tasks/)
    expect(() =>
      assertTeamAcceptsWorkerStart({ db, run, terminal: undefined, taskId: task.id })
    ).not.toThrow()
  })
})

describe('one active dispatch per team member', () => {
  let db: OrchestrationDb

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  function attach(taskId: string, handle: string, leaf: string): string {
    const { dispatch } = db.createStartingWorkerDispatch({
      taskId,
      startOptions: {},
      creator: { kind: 'system' },
      maxDepth: Number.MAX_SAFE_INTEGER
    })
    db.prepareStartingWorkerAuthority({
      dispatchId: dispatch.id,
      handle,
      paneKey: `tab_${handle}:${leaf}`,
      processIncarnation: `proc_${handle}`,
      worktreeId: 'wt',
      setupState: 'not_applicable',
      effects: []
    })
    return dispatch.id
  }

  it('refuses a second task of a member whose first still runs on a terminal it replaced', () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    const pam = db.addTeamMember(team.id, { slug: 'pam', roleSlug: 'designer', agent: 'claude' })
    const [first, second, third] = ['First', 'Second', 'Third'].map((spec) =>
      db.createTask({ runId: team.run_id, spec })
    )
    db.assignTeamTask(team.id, first.id, jim.id)
    db.assignTeamTask(team.id, second.id, jim.id)
    db.assignTeamTask(team.id, third.id, pam.id)
    const running = attach(first.id, 'term_old', '11111111-1111-4111-8111-111111111111')

    // A restarted member has a new handle and pane, which the terminal check cannot tie to the old.
    expect(() => attach(second.id, 'term_new', '22222222-2222-4222-8222-222222222222')).toThrow(
      new RegExp(`Team member jim already has an active dispatch \\(${running}`)
    )
    expect(db.listTeamMemberIdsWithActiveDispatch(team.run_id)).toEqual([jim.id])
    expect(() => attach(third.id, 'term_pam', '33333333-3333-4333-8333-333333333333')).not.toThrow()
  })
})
