// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { TeamCommandCenter } from './TeamCommandCenter'
import type { TeamAttention } from './team-attention'
import { makeTeamMember, makeTeamSnapshot, makeTeamTask } from './team-snapshot-test-fixtures'
import type { TeamPageState } from './use-team-page-state'
import type { TeamActivity } from './use-team-activity'

const manager = makeTeamMember({
  id: 'member_lead',
  slug: 'lead',
  display_name: 'Grace',
  is_manager: 1,
  spend_tokens: 1200
})
const temp = makeTeamMember({
  id: 'member_temp',
  slug: 'temp-scout-abcd',
  display_name: 'Scout',
  role_slug: 'temp'
})
const snapshot = makeTeamSnapshot({
  members: [manager, temp],
  tasks: [
    makeTeamTask({ id: 'task_open', assignee_member_id: manager.id, status: 'dispatched' }),
    makeTeamTask({
      id: 'task_temp',
      assignee_member_id: temp.id,
      status: 'completed',
      task_title: 'Audit the migration'
    })
  ]
})
const attention: TeamAttention = { items: [], count: 2, memberIds: new Set() }
const activity: TeamActivity = {
  entries: [],
  live: [],
  epoch: 0,
  source: null,
  loaded: true,
  error: null
}
const act = async (): Promise<boolean> => true
const state: TeamPageState = {
  target: { kind: 'local' },
  repoId: 'repo_1',
  repoName: 'Orca',
  teams: [],
  selectedTeamId: snapshot.team.id,
  selectTeam: () => undefined,
  loaded: true,
  snapshot,
  log: [],
  connectionError: null,
  actionError: null,
  dismissActionError: () => undefined,
  pendingActions: [],
  busy: false,
  refresh: async () => undefined,
  act
}

function renderCenter(): void {
  render(
    <TeamCommandCenter
      state={state}
      snapshot={snapshot}
      attention={attention}
      activity={activity}
      selectedMemberId={null}
      onSelectMember={() => undefined}
      scoped={() => ({ busy: false, act })}
      onAddMember={() => undefined}
      onEditMember={() => undefined}
      onRemoveMember={() => undefined}
      onOpenTask={() => undefined}
      onOpenSettings={() => undefined}
    />
  )
}

describe('TeamCommandCenter', () => {
  beforeEach(() => {
    useAppStore.setState({ teamPageTab: 'agents' })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ teamPageTab: 'orchestrator' })
  })

  it('lists standing agents as cards with tokens and open tickets', () => {
    renderCenter()
    expect(screen.getByText('1 live · 1 on the floor')).toBeTruthy()
    expect(screen.getByText('1,200 tokens')).toBeTruthy()
    expect(screen.getByText('bmt-1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open agent' })).toBeTruthy()
    expect(screen.queryByText('Scout')).toBeNull()
  })

  it('keeps temps out of the agent cards and shows their finished job under Temps', () => {
    useAppStore.setState({ teamPageTab: 'temps' })
    renderCenter()
    expect(screen.getByText('Hire a temp')).toBeTruthy()
    expect(screen.getByText('Scout')).toBeTruthy()
    expect(screen.getByText('Job done')).toBeTruthy()
    expect(screen.getByText(/Audit the migration/)).toBeTruthy()
  })
})
