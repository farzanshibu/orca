// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamMemberRemoveDialog } from './TeamMemberRemoveDialog'
import { TeamMemberDialog } from './TeamSetupDialogs'
import { makeTeamMember } from './team-snapshot-test-fixtures'

const ada = makeTeamMember({
  id: 'member_ada',
  slug: 'ada',
  display_name: 'Ada',
  role_slug: 'engineer',
  role_brief: 'Ships things',
  agent: 'codex'
})

function renderEditDialog() {
  const onSubmit = vi.fn().mockResolvedValue(true)
  const view = render(
    <TeamMemberDialog
      open
      editing={ada}
      hasManager
      busy={false}
      onOpenChange={vi.fn()}
      onSubmit={onSubmit}
    />
  )
  return { view, onSubmit }
}

/** Narrowed rather than asserted, so the field's own value type is what gets read. */
function fieldValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value
  }
  return ''
}

describe('TeamMemberDialog', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('offers saving rather than hiring while editing', () => {
    const { view } = renderEditDialog()
    expect(view.getByText('Edit member')).toBeTruthy()
    expect(view.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect(view.queryByText('Add a member')).toBeNull()
  })

  it('prefills the form from the member being edited', () => {
    const { view } = renderEditDialog()
    expect(fieldValue(view.getByLabelText('Name'))).toBe('Ada')
    expect(fieldValue(view.getByLabelText('Role'))).toBe('engineer')
    expect(fieldValue(view.getByLabelText('Role brief'))).toBe('Ships things')
  })

  it('hides the role bundle, which would overwrite an edit', () => {
    const { view } = renderEditDialog()
    expect(view.queryByLabelText('Role bundle')).toBeNull()
  })

  it('submits the edited fields, keeping the slug the member already answers to', () => {
    const { view, onSubmit } = renderEditDialog()
    fireEvent.change(view.getByLabelText('Role'), { target: { value: 'reviewer' } })
    fireEvent.click(view.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'ada', role: 'reviewer', displayName: 'Ada', agent: 'codex' })
    )
  })

  it('hides the manager switch, which an edit cannot change', () => {
    const { view } = renderEditDialog()
    expect(view.queryByLabelText('This member runs the team')).toBeNull()
  })
})

describe('TeamMemberRemoveDialog', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('stays closed with no member chosen', () => {
    const view = render(
      <TeamMemberRemoveDialog member={null} busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(view.queryByText('Remove member')).toBeNull()
  })

  it('names the member and keeps Cancel quiet beside a destructive Remove', () => {
    const view = render(
      <TeamMemberRemoveDialog member={ada} busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(view.getByText(/This stops Ada and takes it off the team/)).toBeTruthy()
    // Every button class carries an aria-invalid utility, so match the destructive fill itself.
    expect(view.getByRole('button', { name: 'Cancel' }).className).not.toContain('bg-destructive')
    expect(view.getByRole('button', { name: 'Remove' }).className).toContain('bg-destructive')
  })

  it('confirms with the member it was opened on', () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    const view = render(
      <TeamMemberRemoveDialog member={ada} busy={false} onCancel={vi.fn()} onConfirm={onConfirm} />
    )
    fireEvent.click(view.getByRole('button', { name: 'Remove' }))
    expect(onConfirm).toHaveBeenCalledWith(ada)
  })
})
