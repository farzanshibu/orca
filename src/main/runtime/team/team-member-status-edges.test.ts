import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentStatusState } from '../../../shared/agent-status-types'
import { OrchestrationDb } from '../orchestration/db'
import { TEAM_MEMBER_PANE_KEY_MATCH_SUFFIX_SQL } from '../orchestration/db/pane-key-match'
import { watchTeamMemberStatusEdges } from './team-member-status-edges'
import type { TeamMemberTurnState } from './team-member-turn-state'

const LEAF = '22222222-2222-4222-8222-222222222222'
const PANE = `tab_j:${LEAF}`

type Row = { paneKey: string; state: AgentStatusState }

describe('team member status edges', () => {
  let db: OrchestrationDb
  let publish: (rows: Row[]) => void
  let unsubscribed: boolean
  const edges: [string, TeamMemberTurnState][] = []

  function seedJim() {
    const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    const jim = db.addTeamMember(team.id, { slug: 'jim', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(jim.id, { worktreeId: 'wt', terminalHandle: 'h_jim', paneKey: PANE })
    return { team, jim }
  }

  function watch(): () => void {
    return watchTeamMemberStatusEdges({
      getDb: () => db,
      subscribe: (listener) => {
        publish = listener
        return () => {
          unsubscribed = true
        }
      },
      onEdge: (member, state) => edges.push([member.slug, state])
    })
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    unsubscribed = false
    edges.length = 0
  })

  afterEach(() => {
    db.close()
  })

  it('reports a member only when its hook state moves, in turn-state words', () => {
    seedJim()
    const stop = watch()
    const other = {
      paneKey: 'tab_x:33333333-3333-4333-8333-333333333333',
      state: 'working'
    } as const
    publish([{ paneKey: PANE, state: 'working' }, other])
    // The store republishes every row on any change: an unmoved row is not an edge.
    publish([{ paneKey: PANE, state: 'working' }, other])
    publish([{ paneKey: PANE, state: 'done' }, other])
    publish([{ paneKey: PANE, state: 'waiting' }])
    expect(edges).toEqual([
      ['jim', 'working'],
      ['jim', 'idle'],
      ['jim', 'needs_human']
    ])
    stop()
    expect(unsubscribed).toBe(true)
  })

  it('reports a row that left the store and came back in the same state', () => {
    seedJim()
    watch()
    publish([{ paneKey: PANE, state: 'working' }])
    publish([])
    publish([{ paneKey: PANE, state: 'working' }])
    expect(edges).toEqual([
      ['jim', 'working'],
      ['jim', 'working']
    ])
  })

  it('finds the member by pane leaf through the index, across a tab break-out', () => {
    const { team, jim } = seedJim()
    expect(db.findTeamMemberByPaneKey(`tab_moved:${LEAF}`)?.id).toBe(jim.id)
    // Legacy keys share a suffix without being the same pane.
    const pam = db.addTeamMember(team.id, { slug: 'pam', roleSlug: 'engineer', agent: 'codex' })
    db.bindTeamMemberTerminal(pam.id, { worktreeId: 'wt', terminalHandle: 'h_pam', paneKey: 'a:1' })
    expect(db.findTeamMemberByPaneKey('b:1')).toBeUndefined()
    expect(db.findTeamMemberByPaneKey('a:1')?.id).toBe(pam.id)

    const plan = db.db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT * FROM team_members
         WHERE pane_key IS NOT NULL AND ${TEAM_MEMBER_PANE_KEY_MATCH_SUFFIX_SQL} = ?
           AND archived_at IS NULL
           AND team_id IN (SELECT id FROM teams WHERE status != 'archived')`
      )
      .all(LEAF)
    expect(JSON.stringify(plan)).toContain('idx_team_members_pane_leaf')

    db.archiveTeamMember(jim.id)
    expect(db.findTeamMemberByPaneKey(PANE)).toBeUndefined()
    db.updateTeam(team.id, { status: 'archived' })
    expect(db.findTeamMemberByPaneKey('a:1')).toBeUndefined()
  })
})
