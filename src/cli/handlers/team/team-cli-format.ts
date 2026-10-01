import type { TeamGoalSummary } from '../../../shared/team-goal'
import type { CommandHandler } from '../../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { printResult } from '../../format'

export type TeamSummary = { id: string; name: string; status: string; charter: string }
export type MemberView = {
  id: string
  slug: string
  spend_usd: number | null
  spend_cap_usd: number | null
  pause_reason: string | null
  display_name: string
  role_slug: string
  agent: string
  model: string | null
  is_manager: number
  paused_at: string | null
  liveness: string
  agent_status: string | null
  live_handle: string | null
}
export type TeamSnapshot = {
  team: TeamSummary
  members: MemberView[]
  tasks: { id: string; task_title: string | null; status: string }[]
  pendingQuestions: { message_id: string; asker_handle: string; body: string }[]
  pendingGates: { id: string; question: string }[]
  pendingHires: { id: string; slug: string; role_slug: string; agent: string; rationale: string }[]
  /** Absent from a host that predates goals. */
  goals?: TeamGoalSummary[]
}

export function teamParams(flags: Map<string, string | boolean>): { team: string; repo?: string } {
  return {
    team: getRequiredStringFlag(flags, 'team'),
    repo: getOptionalStringFlag(flags, 'repo')
  }
}

export function memberFieldParams(flags: Map<string, string | boolean>) {
  return {
    displayName: getOptionalStringFlag(flags, 'display-name'),
    role: getOptionalStringFlag(flags, 'role'),
    brief: getOptionalStringFlag(flags, 'brief'),
    agent: getOptionalStringFlag(flags, 'agent'),
    model: getOptionalStringFlag(flags, 'model'),
    effort: getOptionalStringFlag(flags, 'effort')
  }
}

export function formatMember(member: MemberView): string {
  const tags = [
    member.is_manager ? 'manager' : null,
    member.paused_at
      ? member.pause_reason === 'spend_cap'
        ? 'paused: spend cap'
        : 'paused'
      : null,
    member.spend_usd !== null
      ? `$${member.spend_usd.toFixed(2)}${member.spend_cap_usd !== null ? `/$${member.spend_cap_usd.toFixed(2)}` : ''}`
      : null,
    member.agent_status
  ].filter(Boolean)
  const model = member.model ? `/${member.model}` : ''
  const handle = member.live_handle ? ` ${member.live_handle}` : ''
  return `${member.slug} (${member.role_slug}) ${member.agent}${model} [${member.liveness}${tags.length ? `, ${tags.join(', ')}` : ''}]${handle}`
}

export function formatSnapshot(value: TeamSnapshot): string {
  const lines = [
    `${value.team.name} [${value.team.status}] ${value.team.id}`,
    ...(value.team.charter ? [`Charter: ${value.team.charter}`] : []),
    '',
    `Members (${value.members.length}):`,
    ...value.members.map((member) => `  ${formatMember(member)}`),
    '',
    `Tasks (${value.tasks.length}):`,
    ...value.tasks.map((task) => `  ${task.id} [${task.status}] ${task.task_title ?? ''}`.trimEnd())
  ]
  const goals = value.goals ?? []
  if (goals.length > 0) {
    lines.push(
      '',
      `Goals (${goals.length}):`,
      ...goals.map(
        (goal) =>
          `  ${goal.ref ?? goal.id} [${goal.status} ${goal.progress.done}/${goal.progress.total}] ${goal.title}`
      )
    )
  }
  const waiting = [
    ...value.pendingQuestions.map(
      (question) =>
        `  question ${question.message_id} from ${question.asker_handle}: ${question.body}`
    ),
    ...value.pendingGates.map((gate) => `  gate ${gate.id}: ${gate.question}`),
    ...value.pendingHires.map(
      (hire) =>
        `  hire ${hire.id}: ${hire.slug} (${hire.role_slug}, ${hire.agent}) ${hire.rationale}`
    )
  ]
  if (waiting.length > 0) {
    lines.push('', `Waiting on you (${waiting.length}):`, ...waiting)
  }
  return lines.join('\n')
}

export function memberHandler(method: string, verb: string): CommandHandler {
  return async ({ flags, client, json }) => {
    const result = await client.call<{ member: MemberView }>(method, {
      ...teamParams(flags),
      member: getRequiredStringFlag(flags, 'member')
    })
    printResult(result, json, (value) => `${verb}: ${formatMember(value.member)}`)
  }
}
