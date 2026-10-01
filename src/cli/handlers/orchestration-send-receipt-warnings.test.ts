import { expect, it, vi } from 'vitest'

const callMock = vi.fn()
vi.mock('../format', () => ({ printResult: vi.fn() }))
vi.mock('../selectors', () => ({ getTerminalHandle: vi.fn() }))

import { printResult } from '../format'
import { ORCHESTRATION_HANDLERS } from './orchestration'

const SEND = {
  command: 'orchestration send',
  flags: [
    ['from', 'term_sender'],
    ['to', 'term_recipient'],
    ['subject', 'ping']
  ]
} as const
const REPLY = {
  command: 'orchestration reply',
  flags: [
    ['from', 'term_sender'],
    ['id', 'msg_1'],
    ['body', 'noted']
  ]
} as const

type FormattedCommand = { command: string; flags: readonly (readonly [string, string])[] }

async function formatSend(
  result: unknown,
  { command, flags }: FormattedCommand = SEND
): Promise<string> {
  callMock.mockReset().mockResolvedValueOnce({ result })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: send and reply read only flags, cwd, json and client.call, and all four are supplied.
  await ORCHESTRATION_HANDLERS[command]({
    flags: new Map(flags),
    client: { call: callMock },
    cwd: '/workspace',
    json: false
  } as never)
  const printCall = vi.mocked(printResult).mock.calls.at(-1)
  const formatter = printCall?.[2] as (value: unknown) => string
  return formatter(result)
}

it('prints a live terminal-only delivery limitation', async () => {
  const line = await formatSend({
    message: { id: 'msg_1' },
    warnings: [
      {
        code: 'legacy_terminal_recipient',
        recipient: 'term_recipient',
        message: 'term_recipient is live now, but its mailbox is not restart-durable.'
      }
    ]
  })

  expect(line).toBe(
    'Sent msg_1\nWarning: term_recipient is live now, but its mailbox is not restart-durable.'
  )
})

it('shows partial fan-out omissions without hiding delivered recipients', async () => {
  const line = await formatSend({
    messages: [{ id: 'msg_1' }],
    recipients: 1,
    warnings: [
      {
        code: 'recipient_unreachable',
        recipient: 'term_gone',
        message: 'Terminal term_gone has no live pane or durable mailbox.'
      }
    ]
  })

  expect(line).toBe(
    'Sent 1 messages to 1 recipients\nWarning: Terminal term_gone has no live pane or durable mailbox.'
  )
})

it('prints delivery limitations on relayed receipts', async () => {
  const line = await formatSend({
    relay: {
      messageId: 'relay_1',
      sequence: 1,
      dispatchId: 'ctx_remote',
      destination: 'worker',
      accepted: true
    },
    warnings: [
      {
        code: 'legacy_terminal_recipient',
        recipient: 'term_remote',
        message: 'term_remote is reachable through a compatibility address.'
      }
    ]
  })

  expect(line).toBe(
    'Queued relay_1 for worker Dispatch ctx_remote\nWarning: term_remote is reachable through a compatibility address.'
  )
})

it('leaves a canonical receipt unchanged', async () => {
  await expect(formatSend({ message: { id: 'msg_1' } })).resolves.toBe('Sent msg_1')
})

it('says when a reply went somewhere other than the sender it answers', async () => {
  const line = await formatSend(
    {
      message: { id: 'msg_escalated' },
      warnings: [
        {
          code: 'thread_escalated',
          recipient: '@member:jim',
          message: 'This thread passed 6 replies, so Orca gave your message to the manager.'
        }
      ]
    },
    REPLY
  )

  expect(line).toBe(
    'Replied msg_escalated\nWarning: This thread passed 6 replies, so Orca gave your message to the manager.'
  )
  await expect(formatSend({ message: { id: 'msg_2' } }, REPLY)).resolves.toBe('Replied msg_2')
})
