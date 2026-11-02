// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeTeamMember, makeTeamSnapshot, makeTeamTask } from './team-snapshot-test-fixtures'
import {
  isTeamTemp,
  makeTeamTempSlug,
  teamTempFinished,
  teamTempJob,
  teamTempJobTitle,
  teamTempPhase,
  useTeamTempRetirement
} from './team-temps'

const temp = makeTeamMember({ id: 'member_temp', role_slug: 'temp', display_name: 'Scout' })
const engineer = makeTeamMember({ id: 'member_eng', role_slug: 'engineer' })

describe('team temps', () => {
  it('recognizes only the reserved temp role', () => {
    expect(isTeamTemp(temp)).toBe(true)
    expect(isTeamTemp(engineer)).toBe(false)
  })

  it('takes the newest ticket as the temp job', () => {
    const older = makeTeamTask({
      id: 'task_old',
      assignee_member_id: 'member_temp',
      created_at: '2026-10-01 10:00:00'
    })
    const newer = makeTeamTask({
      id: 'task_new',
      assignee_member_id: 'member_temp',
      created_at: '2026-10-02 10:00:00'
    })
    expect(teamTempJob(temp, [newer, older])?.id).toBe('task_new')
    expect(teamTempJob(engineer, [newer, older])).toBeUndefined()
  })

  it('is finished only when every owned ticket settled and at least one exists', () => {
    const open = makeTeamTask({ assignee_member_id: 'member_temp', status: 'dispatched' })
    const done = makeTeamTask({
      id: 'task_done',
      assignee_member_id: 'member_temp',
      status: 'completed'
    })
    expect(teamTempFinished(temp, [])).toBe(false)
    expect(teamTempFinished(temp, [open])).toBe(false)
    expect(teamTempFinished(temp, [open, done])).toBe(false)
    expect(teamTempFinished(temp, [done])).toBe(true)
  })

  it('names a job from its first line and a unique slug from the display name', () => {
    expect(teamTempJobTitle('Audit the API\nThen write it up')).toBe('Audit the API')
    expect(teamTempJobTitle('   ')).toBe('One job')
    expect(makeTeamTempSlug('Scout', 'abcd')).toBe('temp-scout-abcd')
    expect(makeTeamTempSlug('!!!', 'abcd')).toBe('temp-agent-abcd')
  })

  it('reports the phase from the job and the terminal', () => {
    const open = makeTeamTask({ assignee_member_id: 'member_temp', status: 'dispatched' })
    expect(teamTempPhase(temp, undefined, 'live')).toBe('hired')
    expect(teamTempPhase(temp, open, 'live')).toBe('working')
    expect(teamTempPhase(temp, open, 'stopped')).toBe('off')
    expect(teamTempPhase({ ...temp, paused_at: '2026-10-02' }, open, 'live')).toBe('paused')
    expect(teamTempPhase(temp, { ...open, status: 'completed' }, 'live')).toBe('done')
    expect(teamTempPhase(temp, { ...open, status: 'failed' }, 'live')).toBe('failed')
  })

  it('removes a finished temp once the snapshot shows its job settled', async () => {
    const act = vi.fn(async () => true)
    const snapshot = makeTeamSnapshot({
      members: [temp],
      tasks: [makeTeamTask({ assignee_member_id: temp.id, status: 'completed' })]
    })
    renderHook(() =>
      useTeamTempRetirement({
        target: { kind: 'local' },
        snapshot,
        pendingActions: [],
        act
      })
    )
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1))
    expect(act).toHaveBeenCalledWith(expect.any(Function), 'temp-retire')
  })
})
