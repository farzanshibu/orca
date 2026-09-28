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

    expect(() => assertTeamAcceptsWorkerStart({ db, run, terminal: 'term_jim' })).not.toThrow()
    db.setTeamMemberPaused(jim.id, true)
    expect(() => assertTeamAcceptsWorkerStart({ db, run: other, terminal: 'term_jim' })).toThrow(
      /jim is paused/
    )
    expect(() => assertTeamAcceptsWorkerStart({ db, run: other, terminal: 'term_x' })).not.toThrow()
    db.updateTeam(team.id, { status: 'paused' })
    expect(() => assertTeamAcceptsWorkerStart({ db, run, terminal: undefined })).toThrow(
      /Platform is paused/
    )
  })
})
