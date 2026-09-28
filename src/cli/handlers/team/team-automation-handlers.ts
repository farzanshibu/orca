import {
  TEAM_MISSION_TEMPLATES,
  describeTeamMissionSchedule
} from '../../../shared/team-mission-schedule'
import type { CommandHandler } from '../../dispatch'
import { getOptionalNumberFlag, getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { printResult } from '../../format'
import { teamParams } from './team-cli-format'

export const TEAM_AUTOMATION_HANDLERS: Record<string, CommandHandler> = {
  'team mission add': async ({ flags, client, json }) => {
    const templateId = getOptionalStringFlag(flags, 'template')
    const template = templateId
      ? TEAM_MISSION_TEMPLATES.find((entry) => entry.id === templateId)
      : undefined
    if (templateId && !template) {
      throw new Error(`Unknown mission template "${templateId}".`)
    }
    const every = getOptionalNumberFlag(flags, 'every')
    const daily = getOptionalStringFlag(flags, 'daily')
    const schedule =
      every !== undefined
        ? { kind: 'interval', minutes: every }
        : daily
          ? { kind: 'daily', time: daily }
          : template?.schedule
    if (!schedule) {
      throw new Error('Pass --every <minutes>, --daily <HH:MM>, or --template.')
    }
    const result = await client.call<{ mission: { id: string; name: string } }>(
      'orchestration.teamMissionAdd',
      {
        ...teamParams(flags),
        name: getOptionalStringFlag(flags, 'name') ?? template?.name,
        prompt: getOptionalStringFlag(flags, 'prompt') ?? template?.prompt,
        target: getOptionalStringFlag(flags, 'target') ?? template?.target,
        schedule
      }
    )
    printResult(
      result,
      json,
      (value) => `Mission ${value.mission.name} scheduled: ${value.mission.id}`
    )
  },

  'team mission list': async ({ flags, client, json }) => {
    const result = await client.call<{
      missions: {
        id: string
        name: string
        target: string
        schedule: string
        enabled: number
        next_run_at: string | null
      }[]
    }>('orchestration.teamMissionList', teamParams(flags))
    printResult(result, json, (value) =>
      value.missions.length === 0
        ? 'No missions.'
        : value.missions
            .map((mission) => {
              const schedule = JSON.parse(mission.schedule)
              return `${mission.id} ${mission.name} -> ${mission.target} ${describeTeamMissionSchedule(schedule)}${mission.enabled ? '' : ' [disabled]'} next=${mission.next_run_at ?? '-'}`
            })
            .join('\n')
    )
  },

  'team closing-time': async ({ flags, client, json }) => {
    const result = await client.call<{ closing: boolean; notified: number }>(
      'orchestration.teamClosingTime',
      { ...teamParams(flags), cancel: flags.has('cancel') ? true : undefined }
    )
    printResult(result, json, (value) =>
      value.closing
        ? `Closing time: told ${value.notified} running member(s) to wrap up.`
        : 'Closing time called off.'
    )
  },

  'team mission enable': missionToggle(true),
  'team mission disable': missionToggle(false),

  'team mission rm': async ({ flags, client, json }) => {
    const result = await client.call<{ removed: string }>('orchestration.teamMissionRemove', {
      ...teamParams(flags),
      id: getRequiredStringFlag(flags, 'id')
    })
    printResult(result, json, (value) => `Removed mission ${value.removed}`)
  },

  'team triggers': async ({ flags, client, json }) => {
    const mode = getOptionalStringFlag(flags, 'mode')
    const webhook = getOptionalStringFlag(flags, 'webhook')
    const compact = getOptionalStringFlag(flags, 'auto-compact-tokens')
    const changing = mode !== undefined || webhook !== undefined || compact !== undefined
    const result = await client.call<{
      triggerMode: string
      autoCompactTokens: number | null
      webhookToken: string | null
      webhookUrl: string | null
    }>(changing ? 'orchestration.teamTriggersSet' : 'orchestration.teamTriggers', {
      ...teamParams(flags),
      ...(changing
        ? {
            triggerMode: mode,
            webhook,
            ...(compact !== undefined
              ? { autoCompactTokens: compact === 'none' ? null : Number(compact) }
              : {})
          }
        : {})
    })
    printResult(result, json, (value) =>
      [
        `Trigger mode: ${value.triggerMode}`,
        `Auto-compact: ${value.autoCompactTokens ?? 'off'}`,
        value.webhookUrl
          ? `Webhook: POST ${value.webhookUrl}\nAuthorization: Bearer ${value.webhookToken}`
          : 'Webhook: off'
      ].join('\n')
    )
  }
}

function missionToggle(enabled: boolean): CommandHandler {
  return async ({ flags, client, json }) => {
    const result = await client.call<{ mission: { name: string } }>(
      'orchestration.teamMissionSetEnabled',
      { ...teamParams(flags), id: getRequiredStringFlag(flags, 'id'), enabled }
    )
    printResult(
      result,
      json,
      (value) => `${value.mission.name} ${enabled ? 'enabled' : 'disabled'}`
    )
  }
}
