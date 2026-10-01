import { afterEach, describe, expect, it, vi } from 'vitest'
import { isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { ORCHESTRATION_TASK_TITLE_MAX_LENGTH } from '../../../../shared/orchestration-task-display'
import {
  canSubmitTeamGoal,
  splitTeamGoalText,
  teamGoalBlocker,
  teamGoalDelivery,
  teamGoalSubmitShortcutKeys
} from './team-goal-draft'
import { makeTeamMember } from './team-snapshot-test-fixtures'

const manager = makeTeamMember({ id: 'member_lead', is_manager: 1 })
const engineer = makeTeamMember({ id: 'member_ada' })
const activeTeam = { status: 'active', closing_at: null }

describe('teamGoalBlocker', () => {
  it('lets a goal through on an active team with a manager', () => {
    for (const support of ['supported', 'unknown'] as const) {
      expect(
        teamGoalBlocker({ support, team: activeTeam, members: [engineer, manager] })
      ).toBeNull()
    }
  })

  it('blocks a host that lacks the capability whatever else is true', () => {
    expect(teamGoalBlocker({ support: 'unsupported', team: activeTeam, members: [manager] })).toBe(
      'host_unsupported'
    )
  })

  it('blocks a team with no manager', () => {
    expect(teamGoalBlocker({ support: 'supported', team: activeTeam, members: [engineer] })).toBe(
      'no_manager'
    )
    expect(teamGoalBlocker({ support: 'supported', team: activeTeam, members: [] })).toBe(
      'no_manager'
    )
  })

  it('names a paused, closing or otherwise inactive team before anything about its roster', () => {
    const blocked = (team: { status: string; closing_at?: string | null }) =>
      teamGoalBlocker({ support: 'supported', team, members: [] })
    expect(blocked({ status: 'paused' })).toBe('team_paused')
    expect(blocked({ status: 'active', closing_at: '2026-09-28 10:00:00' })).toBe('team_closing')
    expect(blocked({ status: 'paused', closing_at: '2026-09-28 10:00:00' })).toBe('team_closing')
    expect(blocked({ status: 'archived' })).toBe('team_inactive')
    expect(blocked({ status: 'on_hold' })).toBe('team_inactive')
  })
})

describe('canSubmitTeamGoal', () => {
  it('needs text, no request in flight and no blocker', () => {
    expect(canSubmitTeamGoal({ text: 'Ship the importer', busy: false, blocker: null })).toBe(true)
    expect(canSubmitTeamGoal({ text: '', busy: false, blocker: null })).toBe(false)
    expect(canSubmitTeamGoal({ text: '  \n ', busy: false, blocker: null })).toBe(false)
    expect(canSubmitTeamGoal({ text: 'Ship the importer', busy: true, blocker: null })).toBe(false)
    for (const blocker of [
      'host_unsupported',
      'no_manager',
      'team_paused',
      'team_closing',
      'team_inactive'
    ] as const) {
      expect(canSubmitTeamGoal({ text: 'Ship the importer', busy: false, blocker })).toBe(false)
    }
  })
})

describe('splitTeamGoalText', () => {
  it('sends a short single line as the title alone', () => {
    expect(splitTeamGoalText('  Ship   the importer \n')).toEqual({ title: 'Ship the importer' })
    const exact = 'x'.repeat(ORCHESTRATION_TASK_TITLE_MAX_LENGTH)
    expect(splitTeamGoalText(exact)).toEqual({ title: exact })
  })

  it('sends a long line as a short title plus the whole text', () => {
    const text =
      `Rebuild the importer so that it streams rows ${'and keeps going '.repeat(8)}`.trim()
    const { title, spec } = splitTeamGoalText(text)
    expect(spec).toBe(text)
    expect(title.length).toBeLessThanOrEqual(ORCHESTRATION_TASK_TITLE_MAX_LENGTH)
    expect(title.endsWith('…')).toBe(true)
    // Cut at a word, so the title is a prefix of the text up to the ellipsis.
    expect(text.startsWith(title.slice(0, -1))).toBe(true)
    expect(text[title.length - 1]).toBe(' ')
  })

  it('titles a multi-line goal by its first line and keeps every line in the spec', () => {
    const text = '\n\nShip the importer\n\n- stream rows\n- resume after a crash'
    expect(splitTeamGoalText(text)).toEqual({ title: 'Ship the importer', spec: text.trim() })
  })

  it('cuts one unbroken run where it is, without splitting a surrogate pair', () => {
    const room = ORCHESTRATION_TASK_TITLE_MAX_LENGTH - 1
    const { title } = splitTeamGoalText(`${'a'.repeat(room - 1)}😀${'b'.repeat(40)}`)
    expect(title).toBe(`${'a'.repeat(room - 1)}…`)
  })
})

describe('teamGoalDelivery', () => {
  it('says when a queued goal has to wait for the operator', () => {
    expect(teamGoalDelivery(manager)).toBe('when_idle')
    const queued = { id: 'queue_1', member_id: manager.id, text: 'Standup', created_at: '' }
    expect(teamGoalDelivery({ ...manager, queue: [queued] })).toBe('behind_queue')
    expect(teamGoalDelivery({ ...manager, paused_at: '2026-09-28 10:00:00' })).toBe(
      'manager_paused'
    )
    expect(teamGoalDelivery({ ...manager, liveness: 'stopped', live_handle: null })).toBe(
      'manager_stopped'
    )
    expect(teamGoalDelivery({ ...manager, liveness: 'unverifiable', live_handle: null })).toBe(
      'manager_silent'
    )
  })
})

describe('goal submit shortcut', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows and accepts ⌘ Enter on macOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'Macintosh' })
    expect(teamGoalSubmitShortcutKeys()).toEqual(['⌘', 'Enter'])
    expect(isScreenSubmitShortcut({ key: 'Enter', metaKey: true })).toBe(true)
    expect(isScreenSubmitShortcut({ key: 'Enter', ctrlKey: true })).toBe(false)
  })

  it('shows and accepts Ctrl Enter on Windows and Linux', () => {
    for (const userAgent of ['Windows NT 10.0', 'X11; Linux x86_64']) {
      vi.stubGlobal('navigator', { userAgent })
      expect(teamGoalSubmitShortcutKeys()).toEqual(['Ctrl', 'Enter'])
      expect(isScreenSubmitShortcut({ key: 'Enter', ctrlKey: true })).toBe(true)
      expect(isScreenSubmitShortcut({ key: 'Enter', metaKey: true })).toBe(false)
    }
  })

  it('leaves a plain Enter to the textarea', () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' })
    expect(isScreenSubmitShortcut({ key: 'Enter' })).toBe(false)
    expect(isScreenSubmitShortcut({ key: 'Enter', ctrlKey: true, isComposing: true })).toBe(false)
  })
})
