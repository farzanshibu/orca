import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import type { TeamHireTemplate, TeamMemberCapabilities } from '../../../../shared/team-capabilities'
import type { TeamMissionSchedule } from '../../../../shared/team-mission-schedule'
import type { TeamListEntry, TeamLogMessage, TeamSnapshot } from './team-snapshot-types'

type TeamRef = { team: string }

export function listTeams(target: RuntimeClientTarget, repo: string) {
  return callRuntimeRpc<{ teams: TeamListEntry[] }>(target, 'orchestration.teamList', { repo })
}

export function showTeam(target: RuntimeClientTarget, team: string) {
  return callRuntimeRpc<TeamSnapshot>(target, 'orchestration.teamShow', { team })
}

export function readTeamLog(target: RuntimeClientTarget, team: string, limit = 100) {
  return callRuntimeRpc<{ messages: TeamLogMessage[] }>(target, 'orchestration.teamLog', {
    team,
    limit
  })
}

export function createTeam(
  target: RuntimeClientTarget,
  params: { repo: string; name: string; charter?: string }
) {
  return callRuntimeRpc<{ team: { id: string } }>(target, 'orchestration.teamCreate', params)
}

export function updateTeam(
  target: RuntimeClientTarget,
  params: TeamRef & { charter?: string; status?: string }
) {
  return callRuntimeRpc(target, 'orchestration.teamUpdate', params)
}

export type TeamMemberDraft = {
  slug: string
  displayName?: string
  role: string
  brief?: string
  agent: string
  model?: string
  effort?: string
  manager?: boolean
  capabilities?: TeamMemberCapabilities
}

export function addTeamMember(target: RuntimeClientTarget, team: string, draft: TeamMemberDraft) {
  return callRuntimeRpc(target, 'orchestration.teamMemberAdd', { team, ...draft })
}

export type TeamMemberAction = 'Start' | 'Stop' | 'Pause' | 'Resume' | 'Remove'

export function runTeamMemberAction(
  target: RuntimeClientTarget,
  params: TeamRef & { member: string; action: TeamMemberAction }
) {
  return callRuntimeRpc(target, `orchestration.teamMember${params.action}`, {
    team: params.team,
    member: params.member
  })
}

export function sendToTeamMember(
  target: RuntimeClientTarget,
  params: TeamRef & { member: string; text: string; interrupt?: boolean }
) {
  return callRuntimeRpc(target, 'orchestration.teamMemberSend', params)
}

export function setTeamMemberCap(
  target: RuntimeClientTarget,
  params: TeamRef & { member: string; capUsd: number | null; tokenCap?: number | null }
) {
  return callRuntimeRpc(target, 'orchestration.teamMemberSetCap', params)
}

export function queueTeamMessage(
  target: RuntimeClientTarget,
  params: TeamRef & { member: string; text: string }
) {
  return callRuntimeRpc(target, 'orchestration.teamQueueAdd', params)
}

export function reorderTeamQueue(
  target: RuntimeClientTarget,
  params: TeamRef & { member: string; order: string[] }
) {
  return callRuntimeRpc(target, 'orchestration.teamQueueReorder', params)
}

export function removeTeamQueueItem(target: RuntimeClientTarget, params: TeamRef & { id: string }) {
  return callRuntimeRpc(target, 'orchestration.teamQueueRemove', params)
}

export function answerTeamQuestion(
  target: RuntimeClientTarget,
  params: TeamRef & { id: string; body: string }
) {
  return callRuntimeRpc(target, 'orchestration.teamAnswer', params)
}

export function resolveTeamGate(
  target: RuntimeClientTarget,
  params: TeamRef & { id: string; resolution: string }
) {
  return callRuntimeRpc(target, 'orchestration.teamGateResolve', params)
}

export function decideTeamHire(
  target: RuntimeClientTarget,
  params: TeamRef & { id: string; decision: 'approve' | 'reject'; start?: boolean }
) {
  return callRuntimeRpc(target, 'orchestration.teamHireDecide', params)
}

export function readTerminalPtyId(target: RuntimeClientTarget, terminal: string) {
  return callRuntimeRpc<{ terminal: { ptyId: string | null } }>(target, 'terminal.show', {
    terminal
  })
}

export function setTeamMemberCapabilities(
  target: RuntimeClientTarget,
  params: TeamRef & { member: string; capabilities: TeamMemberCapabilities }
) {
  return callRuntimeRpc(target, 'orchestration.teamMemberSetCapabilities', params)
}

export function exportTeamMember(
  target: RuntimeClientTarget,
  params: TeamRef & { member: string }
) {
  return callRuntimeRpc<{ template: TeamHireTemplate }>(
    target,
    'orchestration.teamMemberExport',
    params
  )
}

export function importTeamMember(
  target: RuntimeClientTarget,
  params: TeamRef & { template: TeamHireTemplate }
) {
  return callRuntimeRpc(target, 'orchestration.teamMemberImport', params)
}

export type TeamMissionRow = {
  id: string
  name: string
  target: string
  prompt: string
  schedule: string
  enabled: number
  last_run_at: string | null
  next_run_at: string | null
}

export type TeamTriggerSettings = {
  triggerMode: string
  autoCompactTokens: number | null
  webhookToken: string | null
  webhookUrl: string | null
}

export function listTeamMissions(target: RuntimeClientTarget, team: string) {
  return callRuntimeRpc<{ missions: TeamMissionRow[] }>(target, 'orchestration.teamMissionList', {
    team
  })
}

export function addTeamMission(
  target: RuntimeClientTarget,
  params: TeamRef & { name: string; target: string; prompt: string; schedule: TeamMissionSchedule }
) {
  return callRuntimeRpc(target, 'orchestration.teamMissionAdd', params)
}

export function setTeamMissionEnabled(
  target: RuntimeClientTarget,
  params: TeamRef & { id: string; enabled: boolean }
) {
  return callRuntimeRpc(target, 'orchestration.teamMissionSetEnabled', params)
}

export function removeTeamMission(target: RuntimeClientTarget, params: TeamRef & { id: string }) {
  return callRuntimeRpc(target, 'orchestration.teamMissionRemove', params)
}

export function readTeamTriggers(target: RuntimeClientTarget, team: string) {
  return callRuntimeRpc<TeamTriggerSettings>(target, 'orchestration.teamTriggers', { team })
}

export function setTeamTriggers(
  target: RuntimeClientTarget,
  params: TeamRef & {
    triggerMode?: string
    autoCompactTokens?: number | null
    webhook?: 'enable' | 'disable' | 'rotate'
  }
) {
  return callRuntimeRpc<TeamTriggerSettings>(target, 'orchestration.teamTriggersSet', params)
}

export type TeamMemoryHit = {
  kind: string
  id: string
  title: string
  snippet: string
  score: number
}
export type TeamMemoryResult = {
  tickets: TeamMemoryHit[]
  agents: TeamMemoryHit[]
  notes: TeamMemoryHit[]
  graph: {
    nodes: { id: string; kind: string; label: string }[]
    edges: { from: string; to: string }[]
  }
}

export function searchTeamMemory(target: RuntimeClientTarget, team: string, query: string) {
  return callRuntimeRpc<TeamMemoryResult>(target, 'orchestration.teamMemory', { team, query })
}

export function readTeamNote(target: RuntimeClientTarget, team: string, note: string) {
  return callRuntimeRpc<{ content: string | null; path: string }>(
    target,
    'orchestration.teamNoteRead',
    { team, note }
  )
}

export function writeTeamNote(
  target: RuntimeClientTarget,
  params: TeamRef & { note: string; content: string }
) {
  return callRuntimeRpc(target, 'orchestration.teamNoteWrite', params)
}

export function createTeamTask(
  target: RuntimeClientTarget,
  params: TeamRef & { title: string; spec?: string; enrich?: boolean }
) {
  return callRuntimeRpc(target, 'orchestration.teamTaskCreate', params)
}

export function callTeamClosingTime(target: RuntimeClientTarget, team: string, cancel = false) {
  return callRuntimeRpc<{ closing: boolean; notified: number }>(
    target,
    'orchestration.teamClosingTime',
    { team, cancel }
  )
}
