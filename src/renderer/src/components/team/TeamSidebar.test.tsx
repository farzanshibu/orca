// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { TeamSidebar } from './TeamSidebar'
import type { TeamAttention } from './team-attention'
import { makeTeamMember, makeTeamSnapshot } from './team-snapshot-test-fixtures'

const manager = makeTeamMember({
  id: 'member_lead',
  slug: 'lead',
  display_name: 'Grace',
  is_manager: 1
})
const snapshot = makeTeamSnapshot({ members: [manager] })
const attention: TeamAttention = { items: [], count: 2, memberIds: new Set() }

function renderSidebar() {
  const onSelectMember = vi.fn()
  const onAddMember = vi.fn()
  const onOpenSettings = vi.fn()
  render(
    <TeamSidebar
      snapshot={snapshot}
      attention={attention}
      selectedMemberId={null}
      onSelectMember={onSelectMember}
      onAddMember={onAddMember}
      onOpenSettings={onOpenSettings}
    />
  )
  return { onSelectMember, onAddMember, onOpenSettings }
}

describe('TeamSidebar', () => {
  beforeEach(() => {
    useAppStore.setState({ teamPageTab: 'orchestrator' })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ teamPageTab: 'orchestrator' })
  })

  it('lists the five primary sections plus Agents, Temps and Settings', () => {
    renderSidebar()
    for (const name of [
      'Tasks',
      'Inbox',
      'Automations',
      'Memory',
      'Capabilities',
      'Agents',
      'Temps',
      'Team settings'
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Inbox' }).textContent).toContain('2')
  })

  it('marks the current section and switches when another is picked', () => {
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Memory' }))
    expect(useAppStore.getState().teamPageTab).toBe('memory')
  })

  it('returns to the team brain from the brand', () => {
    useAppStore.setState({ teamPageTab: 'tasks' })
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Team brain' }))
    expect(useAppStore.getState().teamPageTab).toBe('orchestrator')
  })

  it('opens a member, adds one and opens settings from the footer', () => {
    const { onSelectMember, onAddMember, onOpenSettings } = renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'Open Grace · Idle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    fireEvent.click(screen.getByRole('button', { name: 'Team settings' }))
    expect(onSelectMember).toHaveBeenCalledWith(manager.id)
    expect(onAddMember).toHaveBeenCalled()
    expect(onOpenSettings).toHaveBeenCalled()
  })
})
