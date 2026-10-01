import type { CommandHandler } from '../../dispatch'
import { getOptionalNumberFlag, getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { printResult } from '../../format'
import {
  formatMember,
  formatSnapshot,
  memberFieldParams,
  teamParams,
  type MemberView,
  type TeamSnapshot,
  type TeamSummary
} from './team-cli-format'

export const TEAM_CORE_HANDLERS: Record<string, CommandHandler> = {
  'team create': async ({ flags, client, json }) => {
    const result = await client.call<{ team: TeamSummary }>('orchestration.teamCreate', {
      repo: getRequiredStringFlag(flags, 'repo'),
      name: getRequiredStringFlag(flags, 'name'),
      charter: getOptionalStringFlag(flags, 'charter')
    })
    printResult(result, json, (value) => `Team ${value.team.name} created: ${value.team.id}`)
  },

  'team list': async ({ flags, client, json }) => {
    const result = await client.call<{
      teams: (TeamSummary & { memberCount: number; pendingHires: number })[]
    }>('orchestration.teamList', {
      repo: getOptionalStringFlag(flags, 'repo'),
      includeArchived: flags.has('include-archived') ? true : undefined
    })
    printResult(result, json, (value) =>
      value.teams.length === 0
        ? 'No teams.'
        : value.teams
            .map(
              (team) =>
                `${team.id} ${team.name} [${team.status}] members=${team.memberCount} pending-hires=${team.pendingHires}`
            )
            .join('\n')
    )
  },

  'team show': async ({ flags, client, json }) => {
    const result = await client.call<TeamSnapshot>('orchestration.teamShow', teamParams(flags))
    printResult(result, json, formatSnapshot)
  },

  'team update': async ({ flags, client, json }) => {
    const limit = getOptionalStringFlag(flags, 'max-parallel')
    const maxParallel = limit === undefined || limit === 'none' ? null : Number(limit)
    if (maxParallel !== null && (!Number.isInteger(maxParallel) || maxParallel <= 0)) {
      throw new Error('--max-parallel must be a positive whole number or "none".')
    }
    const result = await client.call<{ team: TeamSummary }>('orchestration.teamUpdate', {
      ...teamParams(flags),
      charter: getOptionalStringFlag(flags, 'charter'),
      status: getOptionalStringFlag(flags, 'status'),
      ...(limit === undefined ? {} : { maxParallel })
    })
    printResult(result, json, (value) => `Team ${value.team.name} [${value.team.status}]`)
  },

  'team log': async ({ flags, client, json }) => {
    const result = await client.call<{
      messages: {
        sequence: number
        from_handle: string
        to_handle: string
        type: string
        subject: string
      }[]
    }>('orchestration.teamLog', {
      ...teamParams(flags),
      limit: getOptionalNumberFlag(flags, 'limit')
    })
    printResult(result, json, (value) =>
      value.messages.length === 0
        ? 'No messages.'
        : value.messages
            .map(
              (message) =>
                `#${message.sequence} ${message.from_handle} -> ${message.to_handle} [${message.type}] ${message.subject}`
            )
            .join('\n')
    )
  },

  'team answer': async ({ flags, client, json }) => {
    const result = await client.call<{ question: { message_id: string } }>(
      'orchestration.teamAnswer',
      {
        ...teamParams(flags),
        id: getRequiredStringFlag(flags, 'id'),
        body: getRequiredStringFlag(flags, 'body')
      }
    )
    printResult(result, json, (value) => `Answered ${value.question.message_id}`)
  },

  'team gate-resolve': async ({ flags, client, json }) => {
    const result = await client.call<{ gate: { id: string; resolution: string } }>(
      'orchestration.teamGateResolve',
      {
        ...teamParams(flags),
        id: getRequiredStringFlag(flags, 'id'),
        resolution: getRequiredStringFlag(flags, 'resolution')
      }
    )
    printResult(result, json, (value) => `Gate ${value.gate.id} resolved: ${value.gate.resolution}`)
  },

  'team hire-propose': async ({ flags, client, json }) => {
    const result = await client.call<{ proposal: { id: string; slug: string } }>(
      'orchestration.teamHirePropose',
      {
        ...teamParams(flags),
        slug: getRequiredStringFlag(flags, 'slug'),
        ...memberFieldParams(flags),
        rationale: getOptionalStringFlag(flags, 'rationale')
      }
    )
    printResult(
      result,
      json,
      (value) => `Proposed hire ${value.proposal.slug}: ${value.proposal.id} (waiting on the human)`
    )
  },

  'team hire-decide': async ({ flags, client, json }) => {
    const result = await client.call<{
      proposal: { id: string; status: string }
      member: MemberView | null
    }>('orchestration.teamHireDecide', {
      ...teamParams(flags),
      id: getRequiredStringFlag(flags, 'id'),
      decision: getRequiredStringFlag(flags, 'decision'),
      note: getOptionalStringFlag(flags, 'note'),
      start: flags.has('start') ? true : undefined
    })
    printResult(result, json, (value) =>
      value.member
        ? `Hire ${value.proposal.id} ${value.proposal.status}: ${formatMember(value.member)}`
        : `Hire ${value.proposal.id} ${value.proposal.status}`
    )
  }
}
