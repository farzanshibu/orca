// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { TeamAgentCard } from './TeamAgentCard'
import { makeTeamMember } from './team-snapshot-test-fixtures'
import type { TeamMember } from './team-snapshot-types'

// Radix only mounts menu content once it opens; the stub keeps it in the tree so items are clickable.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="member-menu">{children}</div>
  ),
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  )
}))

function renderCard(member: TeamMember = makeTeamMember()) {
  const onEdit = vi.fn()
  const onRemove = vi.fn()
  const view = render(
    <TeamAgentCard
      member={member}
      task={undefined}
      tickets={[]}
      needsYou={false}
      snippet={null}
      busy={false}
      onOpenRoom={() => undefined}
      onAction={() => undefined}
      onEdit={onEdit}
      onRemove={onRemove}
    />
  )
  return { view, onEdit, onRemove }
}

describe('TeamAgentCard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps the running controls alongside the management one', () => {
    const { view } = renderCard()
    expect(view.getByRole('button', { name: 'Open agent' })).toBeTruthy()
    expect(view.getByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(view.getByRole('button', { name: 'Pause' })).toBeTruthy()
  })

  it('names each member in its own menu label', () => {
    expect(
      renderCard(makeTeamMember({ display_name: 'Grace', slug: 'grace' })).view.getByRole(
        'button',
        { name: 'More actions for Grace' }
      )
    ).toBeTruthy()
  })

  it('asks to edit the member it was given', () => {
    const ada = makeTeamMember({ id: 'member_ada', display_name: 'Ada' })
    const { view, onEdit } = renderCard(ada)
    fireEvent.click(view.getByRole('button', { name: 'Edit member' }))
    expect(onEdit).toHaveBeenCalledWith(ada)
  })

  it('asks to remove the member it was given', () => {
    const ada = makeTeamMember({ id: 'member_ada', display_name: 'Ada' })
    const { view, onRemove } = renderCard(ada)
    fireEvent.click(view.getByRole('button', { name: 'Remove member' }))
    expect(onRemove).toHaveBeenCalledWith(ada)
  })
})
