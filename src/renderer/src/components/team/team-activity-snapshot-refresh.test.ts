import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTeamSnapshotRefreshTrigger,
  TEAM_SNAPSHOT_REFRESH_DELAY_MS,
  teamActivityChangesFloor
} from './team-activity-snapshot-refresh'
import { makeTeamActivityEntry } from './team-activity-test-fixtures'

describe('teamActivityChangesFloor', () => {
  it('is true for every kind that changes what the snapshot holds', () => {
    for (const kind of [
      'task_created',
      'task_assigned',
      'task_status',
      'task_settled',
      'dispatch_started',
      'dispatch_failed',
      'goal_created',
      'goal_review',
      'goal_closed',
      'gate_opened',
      'gate_resolved',
      'hire_proposed',
      'hire_decided',
      'member_added',
      'member_state',
      'member_paused',
      'member_resumed'
    ]) {
      expect(teamActivityChangesFloor({ kind, message_type: null }), kind).toBe(true)
    }
  })

  it('is false for plain mail and its receipts', () => {
    expect(teamActivityChangesFloor({ kind: 'message', message_type: 'status' })).toBe(false)
    expect(teamActivityChangesFloor({ kind: 'message', message_type: 'worker_done' })).toBe(false)
    expect(teamActivityChangesFloor({ kind: 'message', message_type: null })).toBe(false)
    expect(teamActivityChangesFloor({ kind: 'delivery', message_type: 'status' })).toBe(false)
  })

  it('is true for mail that puts something in front of the human', () => {
    expect(teamActivityChangesFloor({ kind: 'message', message_type: 'question' })).toBe(true)
    expect(teamActivityChangesFloor({ kind: 'message', message_type: 'decision_gate' })).toBe(true)
  })

  it('is true for a kind this build does not know', () => {
    expect(teamActivityChangesFloor({ kind: 'budget_alert', message_type: null })).toBe(true)
  })
})

describe('createTeamSnapshotRefreshTrigger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const settled = makeTeamActivityEntry(1, { kind: 'task_settled' })
  const mail = makeTeamActivityEntry(2)

  it('refreshes once, 300 ms after a floor-changing event', () => {
    const refresh = vi.fn()
    createTeamSnapshotRefreshTrigger(refresh).notify([mail, settled])

    vi.advanceTimersByTime(TEAM_SNAPSHOT_REFRESH_DELAY_MS - 1)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('folds a burst into one refresh after its last event', () => {
    const refresh = vi.fn()
    const trigger = createTeamSnapshotRefreshTrigger(refresh)
    trigger.notify([settled])
    vi.advanceTimersByTime(200)
    trigger.notify([settled])
    vi.advanceTimersByTime(299)
    expect(refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does nothing for mail, and mail does not delay a refresh already due', () => {
    const refresh = vi.fn()
    const trigger = createTeamSnapshotRefreshTrigger(refresh)
    trigger.notify([mail])
    vi.advanceTimersByTime(1_000)
    expect(refresh).not.toHaveBeenCalled()

    trigger.notify([settled])
    vi.advanceTimersByTime(200)
    trigger.notify([mail])
    vi.advanceTimersByTime(100)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes nothing once cancelled', () => {
    const refresh = vi.fn()
    const trigger = createTeamSnapshotRefreshTrigger(refresh)
    trigger.notify([settled])
    trigger.cancel()
    vi.advanceTimersByTime(1_000)
    expect(refresh).not.toHaveBeenCalled()
  })
})
