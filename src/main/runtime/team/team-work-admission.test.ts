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
