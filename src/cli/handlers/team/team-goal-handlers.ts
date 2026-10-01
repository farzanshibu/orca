import type { TeamGoalCloseResult, TeamGoalCreateResult } from '../../../shared/team-goal'
import type { CommandHandler } from '../../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { printResult } from '../../format'
import { teamParams } from './team-cli-format'

function describeClosedGoal(value: TeamGoalCloseResult): string {
  const name = value.ref ?? value.goalId
  if (value.status !== 'cancelled') {
    return `Closed goal ${name}`
  }
  const running =
    value.runningTasks > 0 ? `; ${value.runningTasks} running task(s) finish on their own` : ''
  return `Cancelled goal ${name} and ${value.cancelledTasks} task(s) that had not started${running}`
}

export const TEAM_GOAL_HANDLERS: Record<string, CommandHandler> = {
  'team goal create': async ({ flags, client, json }) => {
    const result = await client.call<TeamGoalCreateResult>('orchestration.teamGoalCreate', {
      ...teamParams(flags),
      title: getRequiredStringFlag(flags, 'title'),
      spec: getOptionalStringFlag(flags, 'spec')
    })
    printResult(result, json, (value) =>
      value.queued
        ? `Goal ${value.ref ?? value.goalId} filed; the manager plans it at its next idle turn.`
        : `Goal ${value.ref ?? value.goalId} filed.`
    )
  },

  'team goal close': async ({ flags, client, json }) => {
    const result = await client.call<TeamGoalCloseResult>('orchestration.teamGoalClose', {
      ...teamParams(flags),
      goal: getRequiredStringFlag(flags, 'goal'),
      summary: getOptionalStringFlag(flags, 'summary'),
      cancel: flags.has('cancel') ? true : undefined
    })
    printResult(result, json, describeClosedGoal)
  }
}
