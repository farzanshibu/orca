import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { RpcContext } from '../../../core'
import type { OrchestrationDb } from '../../../../orchestration/db'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { TEAM_PEER_THREAD_REPLY_CAP } from '../../../../team/team-mail-thread-cap'
import { createOrchestrationRpcHarness } from '../rpc-test-harness'
import { seedTeamRoster, type SeededTeamRoster } from './team-roster-test-fixture'

const SentMessage = z.object({
  id: z.string(),
  to_handle: z.string(),
  run_id: z.string(),
  type: z.string()
})
const Warnings = z.array(z.object({ code: z.string(), recipient: z.string() })).optional()
const PointReceipt = z.object({ message: SentMessage, warnings: Warnings })
const SingleRecipientReceipt = z.object({ messages: z.tuple([SentMessage]), warnings: Warnings })

describe('mail between two members of a team', () => {
  const h = createOrchestrationRpcHarness()
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let ctx: RpcContext
  let roster: SeededTeamRoster

  beforeEach(() => {
    ;({ db, runtime, ctx } = h.setup(false))
    roster = seedTeamRoster(db, runtime)
  })

  afterEach(() => {
    h.cleanup()
  })

  function send(from: string, to: string, extra: Record<string, unknown> = {}) {
    return h.call('orchestration.send', { from, to, subject: 'api shape', ...extra }, ctx)
  }

  /** The one message a group send to a single member produced. */
  async function sendToMember(from: string, to: string) {
    return SingleRecipientReceipt.parse(await send(from, to)).messages[0]
  }

  async function sendToHandle(from: string, to: string) {
    return PointReceipt.parse(await send(from, to))
  }

  async function reply(from: string, id: string) {
    return PointReceipt.parse(await h.call('orchestration.reply', { from, id, body: 'noted' }, ctx))
  }

  function runMailbox(): string {
    return `run:${roster.team.run_id}`
  }

  function escalations() {
    return db.getUnreadMessages(runMailbox(), ['escalation'])
  }

  /** Jim opens a thread with pam and they answer each other `replies` times. */
  async function tradeReplies(replies: number) {
    let last = await sendToMember('term_jim', '@member:pam')
    for (let index = 0; index < replies; index += 1) {
      last = (await reply(index % 2 === 0 ? 'term_pam' : 'term_jim', last.id)).message
    }
    return last
  }

  it('files a handle-addressed message under the team Run, not the unbound one', async () => {
    const result = await sendToHandle('term_jim', 'term_pam')

    expect(result.message).toMatchObject({ to_handle: 'term_pam', run_id: roster.team.run_id })
    // A member's own-handle mail follows it across a restart, so it is not terminal-only.
    expect(result.warnings).toBeUndefined()
    expect(db.listPendingTeamQueue(roster.member('pam').id)).toMatchObject([{ source: 'mail' }])
    expect(db.listRecentTeamMessages(roster.team.run_id, 10)).toMatchObject([
      { id: result.message.id }
    ])
  })

  it('leaves mail to a terminal outside the team where it was', async () => {
    const result = await sendToHandle('term_jim', 'term_stranger')

    expect(result.message.run_id).toBe('run_unbound')
    expect(result.warnings).toMatchObject([{ code: 'legacy_terminal_recipient' }])
  })

  it('keeps a reply in the thread and the team Run, and wakes the idle member it answers', async () => {
    const opened = await sendToMember('term_jim', '@member:pam')

    const answered = await reply('term_pam', opened.id)

    expect(answered.message).toMatchObject({ to_handle: 'term_jim', run_id: roster.team.run_id })
    expect(db.getMessageById(answered.message.id)?.thread_id).toBe(
      db.getMessageById(opened.id)?.thread_id
    )
    expect(db.listPendingTeamQueue(roster.member('jim').id)).toMatchObject([{ source: 'mail' }])
  })

  it('delivers every reply up to the cap', async () => {
    const last = await tradeReplies(TEAM_PEER_THREAD_REPLY_CAP)

    expect(last.to_handle).not.toBe(runMailbox())
    expect(escalations()).toHaveLength(0)
  })

  it('hands the reply past the cap to the manager instead of the teammate', async () => {
    const last = await tradeReplies(TEAM_PEER_THREAD_REPLY_CAP)
    const jimUnread = db.getUnreadMessages('term_jim').length
    const pamUnread = db.getUnreadMessages('term_pam').length

    const held = await reply('term_pam', last.id)

    expect(held.message).toMatchObject({ to_handle: runMailbox(), type: 'escalation' })
    expect(held.warnings).toMatchObject([{ code: 'thread_escalated', recipient: '@member:jim' }])
    expect(db.getUnreadMessages('term_jim')).toHaveLength(jimUnread)
    expect(db.getUnreadMessages('term_pam')).toHaveLength(pamUnread)
    expect(escalations()).toMatchObject([
      { from_handle: 'term_pam', body: expect.stringContaining('@member:pam and @member:jim') }
    ])
  })

  it('escalates a thread once and then refuses both members, whichever door they use', async () => {
    const last = await tradeReplies(TEAM_PEER_THREAD_REPLY_CAP)
    await reply('term_pam', last.id)
    const threadId = db.getMessageById(last.id)?.thread_id

    await expect(reply('term_pam', last.id)).rejects.toMatchObject({
      code: 'team_thread_escalated'
    })
    await expect(send('term_jim', '@member:pam', { threadId })).rejects.toMatchObject({
      code: 'team_thread_escalated'
    })
    await expect(send('term_jim', 'term_pam', { threadId })).rejects.toMatchObject({
      code: 'team_thread_escalated'
    })
    expect(escalations()).toHaveLength(1)
    // A new thread is a new conversation.
    await expect(sendToMember('term_jim', '@member:pam')).resolves.toMatchObject({
      to_handle: 'term_pam'
    })
  })

  it('never caps a thread the manager is part of', async () => {
    let last = await sendToMember('term_jim', '@role:manager')
    for (let index = 0; index < TEAM_PEER_THREAD_REPLY_CAP + 3; index += 1) {
      last = (await reply(index % 2 === 0 ? 'term_mgr' : 'term_jim', last.id)).message
    }

    expect(escalations()).toHaveLength(0)
    expect(last.type).toBe('status')
  })
})
