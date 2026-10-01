import { translate } from '@/i18n/i18n'
import type { TeamClosingWaitReason } from '../../../../shared/team-closing-wait'
import type { TeamTriggerMode } from '../../../../shared/team-mission-schedule'
import type { TeamWorkWaitReason } from '../../../../shared/team-task-assignment'
import type { TeamMemberLiveness } from './team-member-liveness'

// Every raw value the host sends that the team UI shows goes through here, so none is rendered as-is.

type LabelTable = Readonly<Record<string, () => string>>

/** A value this build has no label for, made readable: `tool_loop` reads "Tool loop". */
export function readableTeamEnumValue(value: string): string {
  const words = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return words ? `${words[0].toUpperCase()}${words.slice(1).toLowerCase()}` : ''
}

function labelFrom(table: LabelTable, value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  // Why hasOwn: a host value like `constructor` must not resolve to an inherited member.
  return Object.hasOwn(table, value) ? table[value]() : readableTeamEnumValue(value)
}

const LIVENESS_LABELS = {
  live: () => translate('team.liveness.live', 'Running'),
  unverifiable: () => translate('team.liveness.unverifiable', 'No recent update'),
  stopped: () => translate('team.liveness.stopped', 'Not running')
} satisfies Record<TeamMemberLiveness, () => string>

export function teamMemberLivenessLabel(liveness: TeamMemberLiveness): string {
  return LIVENESS_LABELS[liveness]()
}

const PAUSE_REASON_LABELS = {
  operator: () => translate('team.pause.operator', 'Paused by you'),
  spend_cap: () => translate('team.pause.spendCap', 'Paused: spend cap reached'),
  token_cap: () => translate('team.pause.tokenCap', 'Paused: token cap reached'),
  tool_loop: () => translate('team.pause.toolLoop', 'Paused: repeated the same tool call')
} satisfies LabelTable

/** Why a member is paused. The host records no reason when the operator paused it. */
export function teamPauseReasonLabel(reason: string | null | undefined): string {
  if (!reason) {
    return PAUSE_REASON_LABELS.operator()
  }
  if (Object.hasOwn(PAUSE_REASON_LABELS, reason)) {
    return labelFrom(PAUSE_REASON_LABELS, reason)
  }
  return translate('team.pause.other', 'Paused: {{reason}}', {
    reason: readableTeamEnumValue(reason)
  })
}

/** A pause Orca applied itself, which only the operator lifts. */
export function isTeamBreakerPause(reason: string | null | undefined): boolean {
  return Boolean(reason) && reason !== 'operator'
}

const WAIT_REASON_LABELS = {
  deps: () => translate('team.wait.deps', 'Waiting on another task'),
  task_blocked: () => translate('team.wait.taskBlocked', 'Waiting on a decision'),
  member_busy: () => translate('team.wait.memberBusy', 'Finishing another task'),
  member_paused: () => translate('team.wait.memberPaused', 'Member is paused'),
  member_not_running: () => translate('team.wait.memberNotRunning', 'Member is not running'),
  member_unverifiable: () =>
    translate('team.wait.memberUnverifiable', 'No recent update from the member'),
  manager_not_running: () => translate('team.wait.managerNotRunning', 'Manager is not running'),
  team_inactive: () => translate('team.wait.teamInactive', 'Team is paused or closing'),
  member_needs_input: () => translate('team.wait.memberNeedsInput', 'Member is waiting on you'),
  team_at_capacity: () =>
    translate('team.wait.teamAtCapacity', 'Team is at its limit of tasks running at once'),
  retry_backoff: () => translate('team.wait.retryBackoff', 'Start failed; Orca retries shortly'),
  escalated: () =>
    translate('team.wait.escalated', 'Starts kept failing; the manager has to assign it again'),
  task_taken: () => translate('team.wait.taskTaken', 'Already started, or no longer theirs')
} satisfies Record<TeamWorkWaitReason, () => string>

/** Why an assigned task has not started. */
export function teamWaitReasonLabel(reason: string | null | undefined): string {
  return labelFrom(WAIT_REASON_LABELS, reason)
}

const CLOSING_WAIT_REASON_LABELS = {
  working: () => translate('team.closingWait.working', 'Finishing its current step'),
  needs_human: () => translate('team.closingWait.needsHuman', 'Waiting on you'),
  closing_note_queued: () =>
    translate('team.closingWait.closingNoteQueued', 'Wrap-up note not sent yet'),
  stopping: () => translate('team.closingWait.stopping', 'Wrapped up, stopping shortly'),
  status_unknown: () => translate('team.closingWait.statusUnknown', 'Status not readable'),
  unverifiable: () => translate('team.closingWait.unverifiable', 'No recent update')
} satisfies Record<TeamClosingWaitReason, () => string>

/** Why Closing Time still waits on a member. */
export function teamClosingWaitReasonLabel(reason: string | null | undefined): string {
  return labelFrom(CLOSING_WAIT_REASON_LABELS, reason)
}

const TASK_STATUS_LABELS = {
  pending: () => translate('team.taskStatus.pending', 'Waiting on other tasks'),
  ready: () => translate('team.taskStatus.ready', 'Ready'),
  dispatched: () => translate('team.taskStatus.dispatched', 'In progress'),
  completed: () => translate('team.taskStatus.completed', 'Done'),
  failed: () => translate('team.taskStatus.failed', 'Failed'),
  blocked: () => translate('team.taskStatus.blocked', 'Blocked')
} satisfies LabelTable

export function teamTaskStatusLabel(status: string | null | undefined): string {
  return labelFrom(TASK_STATUS_LABELS, status)
}

const TASK_KIND_LABELS = {
  task: () => translate('team.taskKind.task', 'Task'),
  goal: () => translate('team.taskKind.goal', 'Goal')
} satisfies LabelTable

export function teamTaskKindLabel(kind: string | null | undefined): string {
  return labelFrom(TASK_KIND_LABELS, kind)
}

const GOAL_STATUS_LABELS = {
  open: () => translate('team.goalStatus.open', 'Open'),
  completed: () => translate('team.goalStatus.completed', 'Completed'),
  cancelled: () => translate('team.goalStatus.cancelled', 'Cancelled')
} satisfies LabelTable

export function teamGoalStatusLabel(status: string | null | undefined): string {
  return labelFrom(GOAL_STATUS_LABELS, status)
}

const TEAM_STATUS_LABELS = {
  active: () => translate('team.status.active', 'Active'),
  paused: () => translate('team.status.paused', 'Paused'),
  archived: () => translate('team.status.archived', 'Archived')
} satisfies LabelTable

export function teamStatusLabel(status: string | null | undefined): string {
  return labelFrom(TEAM_STATUS_LABELS, status)
}

const MESSAGE_TYPE_LABELS = {
  status: () => translate('team.messageType.status', 'Status'),
  dispatch: () => translate('team.messageType.dispatch', 'Assignment'),
  worker_done: () => translate('team.messageType.workerDone', 'Work finished'),
  merge_ready: () => translate('team.messageType.mergeReady', 'Ready to merge'),
  escalation: () => translate('team.messageType.escalation', 'Escalation'),
  handoff: () => translate('team.messageType.handoff', 'Handoff'),
  decision_gate: () => translate('team.messageType.decisionGate', 'Decision gate'),
  question: () => translate('team.messageType.question', 'Question'),
  heartbeat: () => translate('team.messageType.heartbeat', 'Heartbeat')
} satisfies LabelTable

/** The kind of mail a team log row is. */
export function teamMessageTypeLabel(type: string | null | undefined): string {
  return labelFrom(MESSAGE_TYPE_LABELS, type)
}

const TRIGGER_MODE_LABELS = {
  'communication-only': () => translate('team.triggerMode.communicationOnly', 'Post messages only'),
  'allow-all': () => translate('team.triggerMode.allowAll', 'Post messages and create tasks'),
  off: () => translate('team.triggerMode.off', 'Nothing')
} satisfies Record<TeamTriggerMode, () => string>

export function teamTriggerModeLabel(mode: string | null | undefined): string {
  return labelFrom(TRIGGER_MODE_LABELS, mode)
}

const ACTIVITY_KIND_LABELS = {
  message: () => translate('team.activityKind.message', 'Message'),
  delivery: () => translate('team.activityKind.delivery', 'Delivery'),
  task_created: () => translate('team.activityKind.taskCreated', 'Task created'),
  task_assigned: () => translate('team.activityKind.taskAssigned', 'Task assigned'),
  task_status: () => translate('team.activityKind.taskStatus', 'Task status changed'),
  task_settled: () => translate('team.activityKind.taskSettled', 'Task finished'),
  dispatch_started: () => translate('team.activityKind.dispatchStarted', 'Work started'),
  dispatch_failed: () => translate('team.activityKind.dispatchFailed', 'Work failed'),
  goal_created: () => translate('team.activityKind.goalCreated', 'Goal created'),
  goal_review: () => translate('team.activityKind.goalReview', 'Goal ready for review'),
  goal_closed: () => translate('team.activityKind.goalClosed', 'Goal closed'),
  gate_opened: () => translate('team.activityKind.gateOpened', 'Decision needed'),
  gate_resolved: () => translate('team.activityKind.gateResolved', 'Decision made'),
  hire_proposed: () => translate('team.activityKind.hireProposed', 'Hire proposed'),
  hire_decided: () => translate('team.activityKind.hireDecided', 'Hire decided'),
  member_added: () => translate('team.activityKind.memberAdded', 'Member added'),
  member_state: () => translate('team.activityKind.memberState', 'Member started or stopped'),
  member_paused: () => translate('team.activityKind.memberPaused', 'Member paused'),
  member_resumed: () => translate('team.activityKind.memberResumed', 'Member resumed')
} satisfies LabelTable

/** The kind of an `orchestration.teamActivity` event. */
export function teamActivityKindLabel(kind: string | null | undefined): string {
  return labelFrom(ACTIVITY_KIND_LABELS, kind)
}

const ACTIVITY_PARTY_LABELS = {
  // A member the roster no longer lists, so there is no name to show.
  member: () => translate('team.activityParty.member', 'Former member'),
  operator: () => translate('team.activityParty.operator', 'You'),
  external: () => translate('team.activityParty.external', 'Automation'),
  system: () => translate('team.activityParty.system', 'Orca'),
  agent: () => translate('team.activityParty.agent', 'Another agent'),
  team: () => translate('team.activityParty.team', 'Team')
} satisfies LabelTable

/** One end of an activity event that is not a member on the roster. */
export function teamActivityPartyLabel(party: string | null | undefined): string {
  return labelFrom(ACTIVITY_PARTY_LABELS, party)
}
