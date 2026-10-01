import { vi } from 'vitest'
import type { OrchestrationDb } from '../../../../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../../../../orchestration/team-types'
import type { OrcaRuntimeService } from '../../../../orca-runtime'

export const TEAM_MEMBER_PANES = {
  term_mgr: 'tab_mgr:11111111-1111-4111-8111-111111111111',
  term_jim: 'tab_jim:22222222-2222-4222-8222-222222222222',
  term_pam: 'tab_pam:33333333-3333-4333-8333-333333333333',
  term_oscar: 'tab_oscar:44444444-4444-4444-8444-444444444444'
} as const

export type SeededTeamRoster = {
  team: TeamRow
  member: (slug: string) => TeamMemberRow
  /** Handles whose terminal is running; delete one to make its member unreachable. */
  livePanes: Map<string, string>
}

/**
 * A team whose manager (michael, role `lead`) coordinates its Run, with jim, pam and oscar in live
 * terminals and kevin stopped. `term_stranger` is a live terminal on no roster.
 */
export function seedTeamRoster(db: OrchestrationDb, runtime: OrcaRuntimeService): SeededTeamRoster {
  const livePanes = new Map<string, string>([
    ...Object.entries(TEAM_MEMBER_PANES),
    ['term_stranger', 'tab_stranger:55555555-5555-4555-8555-555555555555']
  ])
  vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation(
    (handle) => livePanes.get(handle) ?? null
  )
  vi.spyOn(runtime, 'getLiveTerminalPaneKey').mockImplementation(
    (handle) => livePanes.get(handle) ?? null
  )
  vi.spyOn(runtime, 'getTerminalHandleForPaneKey').mockReturnValue(null)
  const team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
  const add = (slug: string, roleSlug: string, handle: string | null, isManager = false): void => {
    const row = db.addTeamMember(team.id, { slug, roleSlug, agent: 'claude', isManager })
    if (handle) {
      db.bindTeamMemberTerminal(row.id, {
        worktreeId: `wt_${slug}`,
        terminalHandle: handle,
        paneKey: livePanes.get(handle) ?? null
      })
      db.setTeamMemberDesiredState(row.id, 'running')
    }
  }
  add('michael', 'lead', 'term_mgr', true)
  add('jim', 'engineer', 'term_jim')
  add('pam', 'engineer', 'term_pam')
  add('oscar', 'reviewer', 'term_oscar')
  add('kevin', 'reviewer', null)
  db.bindRun({
    runId: team.run_id,
    coordinatorHandle: 'term_mgr',
    coordinatorPaneKey: TEAM_MEMBER_PANES.term_mgr
  })
  return {
    team: db.requireTeam(team.id),
    member: (slug) => db.resolveTeamMemberSelector(team.id, slug),
    livePanes
  }
}
