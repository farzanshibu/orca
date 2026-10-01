import type { TeamTaskCreateResult } from '../../../shared/team-goal'
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

function describeFiledTask(value: TeamTaskCreateResult): string {
  if (value.enriched) {
    return 'Sent to the manager to write up.'
  }
  const filed = `Filed ${value.ref ?? value.taskId}`
  return value.assignment ? `${filed}. ${describeAssignment(value.assignment)}` : filed
}

/** `--deps a,b` as the refs it names; undefined when the flag is absent. */
function dependencyRefs(flags: Map<string, string | boolean>): string[] | undefined {
  const deps = getOptionalStringFlag(flags, 'deps')
    ?.split(',')
    .map((dep) => dep.trim())
    .filter(Boolean)
  return deps?.length ? deps : undefined
}

export const TEAM_TASK_HANDLERS: Record<string, CommandHandler> = {
  'team task add': async ({ flags, client, json }) => {
    const result = await client.call<TeamTaskCreateResult>('orchestration.teamTaskCreate', {
      ...teamParams(flags),
      title: getRequiredStringFlag(flags, 'title'),
      spec: getOptionalStringFlag(flags, 'spec'),
      enrich: flags.has('enrich') ? true : undefined,
      goal: getOptionalStringFlag(flags, 'goal'),
      assignee: getOptionalStringFlag(flags, 'assignee'),
      deps: dependencyRefs(flags)
    })
    printResult(result, json, describeFiledTask)
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
