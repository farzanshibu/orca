import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TeamPageHeaderActions } from './TeamPageHeaderActions'
import { makeTeamMember, makeTeamSnapshot } from './team-snapshot-test-fixtures'
import type { TeamSnapshot } from './team-snapshot-types'

function headerMarkup(snapshot: TeamSnapshot | null): string {
  return renderToStaticMarkup(
    <TeamPageHeaderActions
      target={{ kind: 'local' }}
      snapshot={snapshot}
      canCreateTeam
      pendingActions={[]}
      act={async () => true}
      onAddMember={() => undefined}
      onImportTemplate={() => undefined}
      onNewTeam={() => undefined}
    />
  )
}

describe('TeamPageHeaderActions', () => {
  it('leads with New goal once the team has a manager', () => {
    const markup = headerMarkup(
      makeTeamSnapshot({ members: [makeTeamMember({ is_manager: 1 }), makeTeamMember()] })
    )
    expect(markup).toContain('New goal')
    expect(markup).toContain('Add member')
    expect(markup).not.toContain('Add a manager')
    // Import template and New team sit in the closed overflow menu.
    expect(markup).toContain('More team actions')
    expect(markup).not.toContain('Import template')
  })

  it('asks for a manager instead of a goal while the team has none', () => {
    const markup = headerMarkup(makeTeamSnapshot({ members: [makeTeamMember()] }))
    expect(markup).toContain('Add a manager')
    expect(markup).not.toContain('New goal')
  })

  it('offers only New team while no team is shown', () => {
    const markup = headerMarkup(null)
    expect(markup).toContain('New team')
    expect(markup).not.toContain('New goal')
    expect(markup).not.toContain('More team actions')
  })
})
