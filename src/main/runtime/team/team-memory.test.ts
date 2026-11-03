import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../orchestration/db'
import { teamHostFilesFor } from './team-host-files'
import { collectTeamMemoryDocs } from './team-memory-docs'
import {
  buildTeamMemoryGraph,
  findTeamMemoryMentions,
  rankTeamMemory,
  tokenizeTeamMemory
} from './team-memory-index'
import { isTeamNotePath } from './team-notes'

describe('team memory index', () => {
  it('normalizes word forms so tests, testing, and tested meet', () => {
    expect(tokenizeTeamMemory('Testing the tests; tested!')).toEqual(['test', 'test', 'test'])
  })

  it('ranks the doc that talks most about the query first', () => {
    const docs = [
      {
        kind: 'note' as const,
        id: 'a',
        title: 'Deploy notes',
        text: 'deploy pipeline deploy',
        links: []
      },
      { kind: 'ticket' as const, id: 'b', title: 'Fix login', text: 'login form error', links: [] },
      { kind: 'agent' as const, id: 'c', title: 'Jim', text: 'handles deploy sometimes', links: [] }
    ]
    expect(rankTeamMemory(docs, 'deploy').map((hit) => hit.id)).toEqual(['a', 'c'])
    expect(rankTeamMemory(docs, '')).toHaveLength(3)
  })

  it('links notes to the members and tickets they mention', () => {
    expect(
      findTeamMemoryMentions(
        'Asked @jim and @member:pam about PLA-3',
        new Map([
          ['jim', 'm1'],
          ['pam', 'm2']
        ]),
        new Map([['pla-3', 't3']])
      ).sort()
    ).toEqual(['m1', 'm2', 't3'])
    const graph = buildTeamMemoryGraph([
      { kind: 'note', id: 'n', title: 'n', text: '', links: ['m1', 'missing', 'm1'] },
      { kind: 'agent', id: 'm1', title: 'jim', text: '', links: ['n'] }
    ])
    expect(graph.edges).toEqual([{ from: 'n', to: 'm1' }])
  })

  it('addresses only notes inside the team root', () => {
    expect(isTeamNotePath('board')).toBe(true)
    expect(isTeamNotePath('members/jim')).toBe(true)
    expect(isTeamNotePath('notes/deploy-plan')).toBe(true)
    expect(isTeamNotePath('../secrets')).toBe(false)
    expect(isTeamNotePath('notes/../../x')).toBe(false)
  })
})

describe('collectTeamMemoryDocs', () => {
  let db: OrchestrationDb
  let repoPath: string

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    repoPath = mkdtempSync(join(tmpdir(), 'orca-team-memory-'))
  })

  afterEach(() => {
    db.close()
    rmSync(repoPath, { recursive: true, force: true })
  })

  it('gathers tasks, members, and the shared notes', async () => {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.createTask({ spec: 'Speed up the deploy', taskTitle: 'Deploy speed', runId: team.run_id })
    const root = join(repoPath, '.orca/team/platform')
    mkdirSync(join(root, 'members'), { recursive: true })
    writeFileSync(join(root, 'board.md'), '# Board\nPLA-1 is with @jim')
    writeFileSync(join(root, 'members/jim.md'), 'Jim knows the deploy scripts')
    const docs = await collectTeamMemoryDocs({
      db,
      team,
      files: teamHostFilesFor({
        id: 'repo_1',
        path: repoPath,
        displayName: 'repo',
        badgeColor: '#000',
        addedAt: 0,
        kind: 'git'
      }),
      repoPath
    })
    expect(docs.map((doc) => [doc.kind, doc.title])).toEqual([
      ['ticket', 'pla-1 Deploy speed'],
      ['agent', 'jim (engineer)'],
      ['note', 'Board'],
      ['note', 'jim memory']
    ])
    const board = docs.find((doc) => doc.id === 'note:board')
    expect(board?.links).toHaveLength(2)
  })
})
