import { describe, expect, it } from 'vitest'
import { floorIntent } from './office-floor-events'
import { makeTeamActivityEvent } from './team-activity-test-fixtures'

const member = (id: string): { party: string; member_id: string } => ({
  party: 'member',
  member_id: id
})
const members = (...ids: string[]): { party: string; member_ids: string[] } => ({
  party: 'member',
  member_ids: ids
})
const operator = { party: 'operator', member_ids: [] }

describe('floor intents', () => {
  it('reads a new goal as a note for the manager', () => {
    expect(floorIntent(makeTeamActivityEvent(1, { kind: 'goal_created' }))).toEqual({
      kind: 'goal'
    })
  })

  it('reads a started dispatch as work going out to its assignee', () => {
    const event = makeTeamActivityEvent(1, { kind: 'dispatch_started', to: members('ada') })
    expect(floorIntent(event)).toEqual({ kind: 'dispatch', assigneeIds: ['ada'] })
    expect(
      floorIntent(
        makeTeamActivityEvent(2, {
          kind: 'dispatch_started',
          to: { party: 'agent', member_ids: [] }
        })
      )
    ).toBeNull()
  })

  it('carries a handoff and a worker_done in a folder, and other mail in an envelope', () => {
    const mail = (type: string): unknown =>
      floorIntent(
        makeTeamActivityEvent(1, { message_type: type, from: member('ada'), to: members('bo') })
      )
    expect(mail('handoff')).toEqual({
      kind: 'mail',
      fromId: 'ada',
      toIds: ['bo'],
      tint: 'handoff',
      carry: 'folder'
    })
    expect(mail('worker_done')).toMatchObject({ carry: 'folder', tint: 'worker_done' })
    expect(mail('status')).toMatchObject({ carry: 'envelope', tint: 'status' })
    expect(mail('something_new')).toMatchObject({ carry: 'envelope', tint: 'something_new' })
  })

  it('names every recipient of a group send once', () => {
    const event = makeTeamActivityEvent(1, { from: member('ada'), to: members('bo', 'cy', 'bo') })
    expect(floorIntent(event)).toMatchObject({ kind: 'mail', toIds: ['bo', 'cy'] })
  })

  it('sends questions, gates and hires to the human', () => {
    const forHuman = { kind: 'for_human' }
    expect(
      floorIntent(makeTeamActivityEvent(1, { message_type: 'question', to: members('lead') }))
    ).toEqual(forHuman)
    expect(floorIntent(makeTeamActivityEvent(2, { message_type: 'status', to: operator }))).toEqual(
      forHuman
    )
    expect(floorIntent(makeTeamActivityEvent(3, { kind: 'gate_opened', to: operator }))).toEqual(
      forHuman
    )
    expect(
      floorIntent(
        makeTeamActivityEvent(4, { kind: 'hire_proposed', from: member('lead'), to: operator })
      )
    ).toEqual(forHuman)
    // The human's own proposal is not waiting on the human.
    expect(
      floorIntent(
        makeTeamActivityEvent(5, {
          kind: 'hire_proposed',
          from: { party: 'operator', member_id: null },
          to: operator
        })
      )
    ).toBeNull()
  })

  it('reads a completed task as its owner shipping it, and a failed one as nothing', () => {
    const settled = (status: string): unknown =>
      floorIntent(makeTeamActivityEvent(1, { kind: 'task_settled', status, from: member('ada') }))
    expect(settled('completed')).toEqual({ kind: 'shipped', ownerId: 'ada' })
    expect(settled('failed')).toBeNull()
    expect(
      floorIntent(
        makeTeamActivityEvent(2, {
          kind: 'task_settled',
          status: 'completed',
          from: { party: 'system', member_id: null }
        })
      )
    ).toBeNull()
  })

  it('lands a delivered note and a decision on a desk without anyone carrying it', () => {
    const note = makeTeamActivityEvent(1, {
      kind: 'delivery',
      channel: 'queue',
      status: 'delivered',
      to: members('ada')
    })
    expect(floorIntent(note)).toEqual({
      kind: 'mail',
      fromId: null,
      toIds: ['ada'],
      tint: null,
      carry: 'envelope'
    })
    const decided = makeTeamActivityEvent(2, {
      kind: 'gate_resolved',
      from: member('lead'),
      to: members('ada')
    })
    expect(floorIntent(decided)).toMatchObject({ kind: 'mail', fromId: null, toIds: ['ada'] })
  })

  it('leaves alone what changes nothing on the floor, and any kind it has never heard of', () => {
    const quiet = [
      makeTeamActivityEvent(1, { kind: 'delivery', channel: 'mailbox', status: 'read' }),
      makeTeamActivityEvent(2, { kind: 'delivery', channel: 'queue', status: 'failed' }),
      makeTeamActivityEvent(3, { message_type: 'dispatch' }),
      makeTeamActivityEvent(4, { kind: 'task_created' }),
      makeTeamActivityEvent(5, { kind: 'task_assigned' }),
      makeTeamActivityEvent(6, { kind: 'dispatch_failed' }),
      makeTeamActivityEvent(7, { kind: 'member_state' }),
      makeTeamActivityEvent(8, { kind: 'goal_closed' }),
      makeTeamActivityEvent(9, { kind: 'budget_alert', status: 'over_limit' }),
      makeTeamActivityEvent(10, { kind: '' })
    ]
    expect(quiet.map(floorIntent)).toEqual(quiet.map(() => null))
  })
})
