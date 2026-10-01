// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamGoalDialog } from './TeamGoalDialog'
import type { TeamFanoutSupport } from './team-goal-draft'
import { createTeamGoal } from './team-runtime-client'
import { makeTeamMember, makeTeamSnapshot } from './team-snapshot-test-fixtures'
import type { TeamSnapshot } from './team-snapshot-types'
import type { TeamAct } from './use-team-page-state'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), message: vi.fn() } }))
vi.mock('./team-runtime-client', () => ({ createTeamGoal: vi.fn() }))

const createGoal = vi.mocked(createTeamGoal)
const lead = makeTeamMember({ id: 'member_lead', display_name: 'Lee', is_manager: 1 })
const staffed = makeTeamSnapshot({ members: [lead, makeTeamMember()] })

// `act` as the page implements it: the rejection of a mutation becomes the page banner.
const pageAct: TeamAct = async (mutation) => {
  try {
    await mutation()
    return true
  } catch {
    return false
  }
}

function renderDialog(snapshot: TeamSnapshot = staffed, support: TeamFanoutSupport = 'supported') {
  const onOpenChange = vi.fn()
  const view = render(
    <TeamGoalDialog
      open
      target={{ kind: 'local' }}
      snapshot={snapshot}
      support={support}
      busy={false}
      act={pageAct}
      onOpenChange={onOpenChange}
    />
  )
  const field = view.getByRole('textbox', { name: 'Goal' })
  const submit = view.getByRole('button', { name: 'Send to manager' })
  return { view, field, submit, onOpenChange }
}

describe('TeamGoalDialog', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Windows NT 10.0' })
    createGoal.mockResolvedValue({ goalId: 'goal_1', ref: 'bmt-7', title: 'Ship it', queued: true })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('opens with the goal field focused and nothing to send', () => {
    const { field, submit, view } = renderDialog()
    expect(document.activeElement).toBe(field)
    expect(submit).toHaveProperty('disabled', true)
    expect(
      view.getByText(/Orca queues this for Lee and asks it to split the goal into tasks/)
    ).toBeDefined()
    fireEvent.change(field, { target: { value: 'Ship it' } })
    expect(submit).toHaveProperty('disabled', false)
  })

  it('sends once on the platform chord, says what the host did, and closes', async () => {
    const { field, onOpenChange } = renderDialog()
    fireEvent.change(field, { target: { value: 'Ship it' } })
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
      fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    })
    expect(createGoal).toHaveBeenCalledTimes(1)
    expect(createGoal).toHaveBeenCalledWith({ kind: 'local' }, { team: 'team_1', title: 'Ship it' })
    expect(toast.success).toHaveBeenCalledWith('Goal bmt-7 is queued for the manager.')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('ignores the other platform’s chord and a plain Enter', async () => {
    const { field } = renderDialog()
    fireEvent.change(field, { target: { value: 'Ship it' } })
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter', metaKey: true })
      fireEvent.keyDown(field, { key: 'Enter' })
    })
    expect(createGoal).not.toHaveBeenCalled()
  })

  it('does not claim a planning prompt the host did not queue', async () => {
    createGoal.mockResolvedValue({
      goalId: 'goal_1',
      ref: 'bmt-7',
      title: 'Ship it',
      queued: false
    })
    const { field, submit } = renderDialog()
    fireEvent.change(field, { target: { value: 'Ship it' } })
    await act(async () => {
      fireEvent.click(submit)
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.message).toHaveBeenCalledWith(
      'Goal bmt-7 was filed. The manager was not asked to plan it.'
    )
  })

  it('keeps a refusal in the dialog, with the text still there', async () => {
    createGoal.mockRejectedValue(new Error('Team Platform has no manager to plan a goal.'))
    const { field, submit, view, onOpenChange } = renderDialog()
    fireEvent.change(field, { target: { value: 'Ship it' } })
    await act(async () => {
      fireEvent.click(submit)
    })
    expect(view.getByRole('alert').textContent).toBe('Team Platform has no manager to plan a goal.')
    expect(field).toHaveProperty('value', 'Ship it')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('explains a paused team before anything is sent', async () => {
    const paused = makeTeamSnapshot({
      team: { ...staffed.team, status: 'paused' },
      members: staffed.members
    })
    const { field, submit, view } = renderDialog(paused)
    expect(view.getByRole('status').textContent).toContain('This team is paused')
    fireEvent.change(field, { target: { value: 'Ship it' } })
    expect(submit).toHaveProperty('disabled', true)
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    })
    expect(createGoal).not.toHaveBeenCalled()
  })

  it('treats a host without the method as one that cannot plan goals', async () => {
    createGoal.mockRejectedValue(
      Object.assign(new Error('Unknown method'), { code: 'method_not_found' })
    )
    const { field, submit, view } = renderDialog(staffed, 'unknown')
    fireEvent.change(field, { target: { value: 'Ship it' } })
    await act(async () => {
      fireEvent.click(submit)
    })
    expect(view.getByRole('status').textContent).toContain('too old to plan goals')
    expect(submit).toHaveProperty('disabled', true)
  })

  it('says a goal will wait when the manager is not running', () => {
    const stopped = makeTeamSnapshot({
      members: [{ ...lead, liveness: 'stopped', live_handle: null }]
    })
    const { view } = renderDialog(stopped)
    expect(view.getByText(/Lee is not running, so the goal waits in its queue/)).toBeDefined()
  })
})
