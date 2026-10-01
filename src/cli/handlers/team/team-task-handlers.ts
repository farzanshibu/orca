import type { TeamTaskAssignResult } from '../../../shared/team-task-assignment'
import type { CommandHandler } from '../../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { printResult } from '../../format'
import { teamParams } from './team-cli-format'

function describeAssignment(value: TeamTaskAssignResult): string {
  if (!value.member) {
    return `Unassigned ${value.ref}`
  }
  if (value.started) {
    return `Started ${value.ref} on ${value.member}`
  }
  if (value.error) {
    return `Assigned ${value.ref} to ${value.member}; it did not start: ${value.error}`
  }
  return `Assigned ${value.ref} to ${value.member}; it starts when this clears: ${value.waiting ?? 'unknown'}`
}

export const TEAM_TASK_HANDLERS: Record<string, CommandHandler> = {
  'team task add': async ({ flags, client, json }) => {
    const result = await client.call<{
      enriched: boolean
      taskId: string | null
      ref?: string | null
    }>('orchestration.teamTaskCreate', {
      ...teamParams(flags),
      title: getRequiredStringFlag(flags, 'title'),
      spec: getOptionalStringFlag(flags, 'spec'),
      enrich: flags.has('enrich') ? true : undefined
    })
    printResult(result, json, (value) =>
      value.enriched ? 'Sent to the manager to write up.' : `Filed ${value.ref ?? value.taskId}`
    )
  },

  'team task assign': async ({ flags, client, json }) => {
    const result = await client.call<TeamTaskAssignResult>('orchestration.teamTaskAssign', {
      ...teamParams(flags),
      task: getRequiredStringFlag(flags, 'task'),
      member: getOptionalStringFlag(flags, 'member'),
      unassign: flags.has('unassign') ? true : undefined
    })
    printResult(result, json, describeAssignment)
  }
}
