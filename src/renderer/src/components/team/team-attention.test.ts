import { describe, expect, it } from 'vitest'
import { collectTeamAttention, teamMemberAwaitsPermission } from './team-attention'
import { makeTeamMember, makeTeamSnapshot, makeTeamTask } from './team-snapshot-test-fixtures'
import type { TeamHireProposal, TeamPendingQuestion } from './team-snapshot-types'

const lead = makeTeamMember({ id: 'member_lead', is_manager: 1, live_handle: 'term_lead' })
const ada = makeTeamMember({ id: 'member_ada', live_handle: 'term_ada' })
const bo = makeTeamMember({ id: 'member_bo', live_handle: 'term_bo' })

function question(overrides: Partial<TeamPendingQuestion> = {}): TeamPendingQuestion {
  return {
    message_id: 'msg_1',
    asker_handle: 'term_ada',
    subject: 'Which database?',
    body: '',
    created_at: '2026-09-28 10:00:00',
    ...overrides
  }
}

function hire(overrides: Partial<TeamHireProposal> = {}): TeamHireProposal {
  return {
    id: 'hire_1',
    slug: 'qa',
    display_name: 'QA',
    role_slug: 'qa',
    role_brief: '',
    agent: 'claude',
    model: null,
    rationale: '',
    ...overrides
  }
}

describe('collectTeamAttention', () => {
  it('is empty when nothing waits on the human', () => {
    const attention = collectTeamAttention(makeTeamSnapshot({ members: [lead, ada] }))
    expect(attention.items).toEqual([])
    expect(attention.count).toBe(0)
    expect(attention.memberIds.size).toBe(0)
  })

  it('counts questions, gates, hires and permission prompts once each', () => {
    const attention = collectTeamAttention(
      makeTeamSnapshot({
        members: [lead, ada, makeTeamMember({ ...bo, agent_status: 'permission' })],
        tasks: [makeTeamTask({ id: 'task_1', assignee_member_id: 'member_ada' })],
        pendingQuestions: [question()],
        pendingGates: [{ id: 'gate_1', task_id: 'task_1', question: 'Ship it?', options: '[]' }],
        pendingHires: [hire({ proposed_by_member_id: 'member_lead' })]
      })
    )
    expect(attention.items.map((item) => item.kind)).toEqual([
      'question',
      'gate',
      'hire',
      'permission'
    ])
    expect(attention.count).toBe(attention.items.length)
    expect(new Set(attention.items.map((item) => item.id)).size).toBe(4)
    expect([...attention.memberIds].sort()).toEqual(['member_ada', 'member_bo', 'member_lead'])
  })

  it('marks only members that own an item', () => {
    const attention = collectTeamAttention(
      makeTeamSnapshot({ members: [lead, ada, bo], pendingQuestions: [question()] })
    )
    expect([...attention.memberIds]).toEqual(['member_ada'])
  })

  it('attributes a question by member id once the handle was reminted', () => {
    const attention = collectTeamAttention(
      makeTeamSnapshot({
        members: [ada, bo],
        pendingQuestions: [question({ asker_handle: 'term_old', asker_member_id: 'member_bo' })]
      })
    )
    expect(attention.items[0].memberId).toBe('member_bo')
  })

  it('attributes a gate to the host-named member before the task owner', () => {
    const tasks = [makeTeamTask({ id: 'task_1', assignee_member_id: 'member_ada' })]
    const gate = { id: 'gate_1', task_id: 'task_1', question: 'Ship it?', options: '[]' }
    const byOwner = collectTeamAttention(
      makeTeamSnapshot({ members: [ada, bo], tasks, pendingGates: [gate] })
    )
    const byHost = collectTeamAttention(
      makeTeamSnapshot({
        members: [ada, bo],
        tasks,
        pendingGates: [{ ...gate, member_id: 'member_bo' }]
      })
    )
    expect(byOwner.items[0].memberId).toBe('member_ada')
    expect(byHost.items[0].memberId).toBe('member_bo')
  })

  it('still counts an item nobody on the roster owns', () => {
    const attention = collectTeamAttention(
      makeTeamSnapshot({
        members: [ada],
        pendingQuestions: [question({ asker_handle: 'term_gone', asker_member_id: 'member_gone' })],
        pendingGates: [{ id: 'gate_1', task_id: 'task_gone', question: 'Ship it?', options: '[]' }],
        pendingHires: [hire()]
      })
    )
    expect(attention.count).toBe(3)
    expect(attention.items.every((item) => item.memberId === null)).toBe(true)
    expect(attention.memberIds.size).toBe(0)
  })
})

describe('teamMemberAwaitsPermission', () => {
  it('is true for a running member at a prompt', () => {
    expect(teamMemberAwaitsPermission(makeTeamMember({ agent_status: 'permission' }))).toBe(true)
    expect(teamMemberAwaitsPermission(makeTeamMember({ agent_status: 'blocked' }))).toBe(true)
  })

  it('is false while working, idle, paused, or without a live terminal', () => {
    expect(teamMemberAwaitsPermission(makeTeamMember({ agent_status: 'working' }))).toBe(false)
    expect(teamMemberAwaitsPermission(makeTeamMember({ agent_status: null }))).toBe(false)
    expect(
      teamMemberAwaitsPermission(
        makeTeamMember({ agent_status: 'permission', paused_at: '2026-09-28 10:00:00' })
      )
    ).toBe(false)
    expect(
      teamMemberAwaitsPermission(
        makeTeamMember({ agent_status: 'permission', liveness: 'unverifiable', live_handle: null })
      )
    ).toBe(false)
  })
})
