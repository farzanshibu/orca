import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import { PSEUDO_LOCALIZATION_LOCALE } from '@/i18n/pseudo-localization'
import { TEAM_CLOSING_WAIT_REASONS } from '../../../../shared/team-closing-wait'
import { TEAM_TRIGGER_MODES } from '../../../../shared/team-mission-schedule'
import { TEAM_DISPATCH_WAIT_REASONS } from '../../../../shared/team-task-assignment'
import {
  isTeamBreakerPause,
  readableTeamEnumValue,
  teamActivityKindLabel,
  teamClosingWaitReasonLabel,
  teamMemberLivenessLabel,
  teamMessageTypeLabel,
  teamPauseReasonLabel,
  teamStatusLabel,
  teamTaskKindLabel,
  teamTaskStatusLabel,
  teamTriggerModeLabel,
  teamWaitReasonLabel
} from './team-enum-labels'

// Values the host defines in src/main, which the renderer project cannot import; keep in step
// with MESSAGE_TYPES and TaskStatus (orchestration/types.ts), TEAM_STATUSES (team-types.ts),
// TEAM_TASK_KINDS (team-task-meta-store.ts), TEAM_BREAKER_REASONS (team-breaker.ts) and the
// kinds listed in shared/team-activity-event.ts.
const MESSAGE_TYPES = [
  'status',
  'dispatch',
  'worker_done',
  'merge_ready',
  'escalation',
  'handoff',
  'decision_gate',
  'question',
  'heartbeat'
]
const TEAM_STATUSES = ['active', 'paused', 'archived']
const TASK_STATUSES = ['pending', 'ready', 'dispatched', 'completed', 'failed', 'blocked']
const TASK_KINDS = ['task', 'goal']
const PAUSE_REASONS = ['operator', 'spend_cap', 'token_cap', 'tool_loop']
const ACTIVITY_KINDS = [
  'message',
  'delivery',
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
]

// The pseudo locale brackets whatever went through `translate`, which a fallback never does.
const LOCALIZED = /^\[.+\]$/

function expectLocalized(values: readonly string[], label: (value: string) => string): void {
  for (const value of values) {
    expect(label(value), value).toMatch(LOCALIZED)
  }
  expect(new Set(values.map(label)).size, values.join()).toBe(values.length)
}

describe('team enum labels under the pseudo locale', () => {
  beforeAll(async () => {
    await i18n.changeLanguage(PSEUDO_LOCALIZATION_LOCALE)
  })
  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('has a localized label for every value the host sends today', () => {
    expectLocalized(TEAM_DISPATCH_WAIT_REASONS, teamWaitReasonLabel)
    expectLocalized(TEAM_CLOSING_WAIT_REASONS, teamClosingWaitReasonLabel)
    expectLocalized(TEAM_TRIGGER_MODES, teamTriggerModeLabel)
    expectLocalized(MESSAGE_TYPES, teamMessageTypeLabel)
    expectLocalized(TEAM_STATUSES, teamStatusLabel)
    expectLocalized(TASK_STATUSES, teamTaskStatusLabel)
    expectLocalized(TASK_KINDS, teamTaskKindLabel)
    expectLocalized(ACTIVITY_KINDS, teamActivityKindLabel)
    expectLocalized(PAUSE_REASONS, teamPauseReasonLabel)
    expect(teamMemberLivenessLabel('live')).toMatch(LOCALIZED)
    expect(teamMemberLivenessLabel('unverifiable')).toMatch(LOCALIZED)
    expect(teamMemberLivenessLabel('stopped')).toMatch(LOCALIZED)
  })

  it('leaves an unknown value as readable text instead of a missing label', () => {
    expect(teamWaitReasonLabel('member_on_leave')).toBe('Member on leave')
    expect(teamTaskStatusLabel('in-review')).toBe('In review')
    expect(teamActivityKindLabel('goalReopened')).toBe('Goal reopened')
  })
})

describe('team enum labels', () => {
  it('says a member with no recent update is neither running nor stopped', () => {
    expect(teamMemberLivenessLabel('unverifiable')).toBe('No recent update')
    expect(teamMemberLivenessLabel('unverifiable')).not.toBe(teamMemberLivenessLabel('stopped'))
  })

  it('tells an operator pause from a breaker pause', () => {
    expect(teamPauseReasonLabel(null)).toBe('Paused by you')
    expect(teamPauseReasonLabel('operator')).toBe('Paused by you')
    expect(teamPauseReasonLabel('token_cap')).toBe('Paused: token cap reached')
    expect(teamPauseReasonLabel('tool_loop')).toBe('Paused: repeated the same tool call')
    expect(isTeamBreakerPause(null)).toBe(false)
    expect(isTeamBreakerPause('operator')).toBe(false)
    expect(isTeamBreakerPause('spend_cap')).toBe(true)
  })

  it('degrades a missing or unknown value without throwing', () => {
    expect(teamPauseReasonLabel('rate_limit')).toBe('Paused: Rate limit')
    expect(teamMessageTypeLabel(null)).toBe('')
    expect(teamStatusLabel(undefined)).toBe('')
    expect(readableTeamEnumValue('___')).toBe('')
  })

  it('never resolves a host value to an inherited object member', () => {
    for (const value of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(typeof teamTaskStatusLabel(value)).toBe('string')
      expect(typeof teamPauseReasonLabel(value)).toBe('string')
    }
    expect(teamTaskStatusLabel('constructor')).toBe('Constructor')
  })
})
