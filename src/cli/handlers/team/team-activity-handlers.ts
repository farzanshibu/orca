import { setTimeout as delay } from 'node:timers/promises'
import type { TeamActivityEvent, TeamActivityPage } from '../../../shared/team-activity-event'
import type { CommandHandler } from '../../dispatch'
import { getOptionalNumberFlag } from '../../flags'
import { printResult } from '../../format'
import { teamParams, type TeamSnapshot } from './team-cli-format'

const FOLLOW_INTERVAL_MS = 1_000

function describeEvent(event: TeamActivityEvent, names: ReadonlyMap<string, string>): string {
  const from = event.from.member_id
    ? (names.get(event.from.member_id) ?? event.from.member_id)
    : event.from.party
  const to =
    event.to.member_ids.length > 0
      ? event.to.member_ids.map((id) => names.get(id) ?? id).join(', ')
      : event.to.party
  const what = [event.kind, event.message_type ?? event.status].filter(Boolean).join(':')
  const ref = event.task_ref ? ` ${event.task_ref}` : ''
  return `#${event.sequence} ${from} -> ${to} [${what}]${ref} ${event.subject}`
}

export const TEAM_ACTIVITY_HANDLERS: Record<string, CommandHandler> = {
  'team activity': async ({ flags, client, json }) => {
    const params = { ...teamParams(flags), limit: getOptionalNumberFlag(flags, 'limit') }
    const snapshot = await client.call<TeamSnapshot>('orchestration.teamShow', teamParams(flags))
    const names = new Map(snapshot.result.members.map((member) => [member.id, member.slug]))
    let page = await client.call<TeamActivityPage>('orchestration.teamActivity', {
      ...params,
      afterSequence: getOptionalNumberFlag(flags, 'after')
    })
    const format = (value: TeamActivityPage): string =>
      value.events.map((event) => describeEvent(event, names)).join('\n')
    if (!flags.has('follow')) {
      printResult(page, json, (value) => format(value) || 'No activity.')
      return
    }
    // Follows until interrupted; JSON mode prints one event per line so a reader can stream it.
    for (;;) {
      for (const event of page.result.events) {
        console.log(json ? JSON.stringify(event) : describeEvent(event, names))
      }
      if (!page.result.hasMore) {
        await delay(FOLLOW_INTERVAL_MS)
      }
      page = await client.call<TeamActivityPage>('orchestration.teamActivity', {
        ...params,
        afterSequence: page.result.latestSequence
      })
    }
  }
}
