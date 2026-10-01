import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTeamActivityPage } from '../team/team-activity-projection'
import { OrchestrationDb } from './db'
import type { TeamMemberRow, TeamRow } from './team-types'

const MANAGER_PANE = 'tab_mgr:11111111-1111-4111-8111-111111111111'
const JIM_PANE = 'tab_jim:22222222-2222-4222-8222-222222222222'
const PAM_PANE = 'tab_pam:33333333-3333-4333-8333-333333333333'

describe('team activity feed', () => {
  let db: OrchestrationDb
  let team: TeamRow
  let michael: TeamMemberRow
  let jim: TeamMemberRow
  let pam: TeamMemberRow

  /** Everything recorded after setup, oldest first, as the feed returns it. */
  let baseline: number
  function feed() {
    return readTeamActivityPage(db, db.requireTeam(team.id), { afterSequence: baseline }).events
  }

  function member(
    slug: string,
    roleSlug: string,
    handle: string,
    paneKey: string,
    manager = false
  ) {
    const row = db.addTeamMember(team.id, { slug, roleSlug, agent: 'claude', isManager: manager })
    return db.bindTeamMemberTerminal(row.id, {
      worktreeId: `wt_${slug}`,
      terminalHandle: handle,
      paneKey
    })
  }

  function dispatchTo(taskId: string, handle: string, paneKey: string) {
    return db.createDispatchContext({
      taskId,
      assigneeHandle: handle,
      assigneePaneKey: paneKey,
      creator: { kind: 'terminal', handle: 'term_mgr', paneKey: MANAGER_PANE },
      maxDepth: Number.MAX_SAFE_INTEGER
    })
  }

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    team = db.createTeam({ repoId: 'repo_1', name: 'Platform' })
    michael = member('michael', 'manager', 'term_mgr', MANAGER_PANE, true)
    jim = member('jim', 'engineer', 'term_jim', JIM_PANE)
    pam = member('pam', 'designer', 'term_pam', PAM_PANE)
    baseline = db.getLatestTeamActivitySequence(team.id)
  })

  afterEach(() => {
    db.close()
  })

  it('records mail with the members it went between, and skips heartbeats and other runs', () => {
    db.insertMessage({
      from: 'term_jim',
      to: `run:${team.run_id}`,
      subject: 'Schema is done',
      body: 'Migrations pass.',
      type: 'status',
      runId: team.run_id
    })
    db.insertMessage({
      from: 'term_jim',
      to: `run:${team.run_id}`,
      subject: 'alive',
      type: 'heartbeat',
      runId: team.run_id
    })
    db.insertMessage({ from: 'term_a', to: 'term_b', subject: 'elsewhere', type: 'status' })
    expect(feed()).toMatchObject([
      {
        kind: 'message',
        channel: 'mailbox',
        message_type: 'status',
        from: { party: 'member', member_id: jim.id },
        to: { party: 'member', member_ids: [michael.id] },
        subject: 'Schema is done',
        body_preview: 'Migrations pass.'
      }
    ])
  })

  it('resolves a dispatch mailbox to its assignee and names outside senders', () => {
    const task = db.createTask({ runId: team.run_id, spec: 'Build the API', taskTitle: 'API' })
    const dispatch = dispatchTo(task.id, 'term_jim', JIM_PANE)
    baseline = db.getLatestTeamActivitySequence(team.id)
    db.insertMessage({
      from: 'external:webhook',
      to: `dispatch:${dispatch.id}`,
      subject: 'Deploy failed',
      type: 'escalation',
      runId: team.run_id
    })
    const answer = db.insertMessage({
      from: `run:${team.run_id}`,
      to: `dispatch:${dispatch.id}`,
      subject: 'Use Postgres',
      type: 'status',
      runId: team.run_id
    })
    db.attributeTeamActivityMessage(answer.id, { party: 'operator' })
    db.markAsRead([answer.id])
    expect(feed()).toMatchObject([
      {
        from: { party: 'external', member_id: null },
        to: { member_ids: [jim.id] },
        dispatch_id: dispatch.id,
        task_id: task.id,
        task_ref: 'pla-1'
      },
      { from: { party: 'operator', member_id: null }, to: { member_ids: [jim.id] } },
      { kind: 'delivery', channel: 'mailbox', status: 'read', to: { member_ids: [jim.id] } }
    ])
  })

  it('merges a group send into one event naming every recipient', () => {
    db.insertMessages(
      ['term_jim', 'term_pam'].map((to) => ({
        from: 'term_mgr',
        to,
        subject: 'Standup in five',
        type: 'status' as const,
        threadId: 'thread_1',
        runId: team.run_id
      }))
    )
    const events = feed()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      from: { member_id: michael.id },
      to: { party: 'member', member_ids: [jim.id, pam.id] }
    })
    // The cursor moves past every merged row.
    expect(events[0].sequence).toBe(db.getLatestTeamActivitySequence(team.id))
  })

  it('numbers a task when it is filed and follows it through dispatch and completion', () => {
    const task = db.createTask({ runId: team.run_id, spec: 'Build the API', taskTitle: 'API' })
    expect(db.getTeamTaskMeta(task.id)).toMatchObject({ number: 1, kind: 'task' })
    expect(db.requireTeam(team.id).task_counter).toBe(1)
    const dispatch = dispatchTo(task.id, 'term_jim', JIM_PANE)
    db.db
      .prepare("UPDATE tasks SET status = 'completed', result = 'Shipped' WHERE id = ?")
      .run(task.id)
    expect(feed()).toMatchObject([
      { kind: 'task_created', task_ref: 'pla-1', subject: 'API', from: { party: 'operator' } },
      {
        kind: 'dispatch_started',
        from: { member_id: michael.id },
        to: { member_ids: [jim.id] },
        dispatch_id: dispatch.id
      },
      {
        kind: 'task_settled',
        status: 'completed',
        from: { party: 'member', member_id: jim.id },
        to: { member_ids: [michael.id] },
        body_preview: 'Shipped'
      }
    ])
  })

  it('names a goal and ties its tasks to it', () => {
    const goal = db.createTask({ runId: team.run_id, spec: 'Ship v2', taskTitle: 'Ship v2' })
    db.markTeamTaskKind(team.id, goal.id, 'goal')
    const child = db.createTask({ runId: team.run_id, spec: 'Schema', parentId: goal.id })
    db.db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(goal.id)
    expect(feed()).toMatchObject([
      { kind: 'goal_created', task_id: goal.id, goal_id: goal.id },
      { kind: 'task_created', task_id: child.id, goal_id: goal.id },
      { kind: 'goal_closed', task_id: goal.id }
    ])
  })

  it('records members, hires, and queue deliveries with who caused them', () => {
    db.setTeamMemberPaused(jim.id, true, 'spend_cap')
    db.setTeamMemberPaused(jim.id, false)
    db.setTeamMemberDesiredState(jim.id, 'running')
    const proposal = db.createTeamHireProposal(team.id, {
      slug: 'oscar',
      roleSlug: 'reviewer',
      agent: 'codex',
      rationale: 'Reviews pile up',
      proposedByMemberId: michael.id
    })
    db.decideTeamHireProposal(proposal.id, 'approved')
    const queued = db.enqueueTeamMemberMessage(
      jim.id,
      'Run the standup\nwith notes',
      'mission:standup'
    )
    db.settleTeamQueueItem(queued.id, { delivered: true })
    const failed = db.enqueueTeamMemberMessage(jim.id, 'From you')
    db.settleTeamQueueItem(failed.id, { delivered: false, reason: 'terminal closed' })
    expect(feed().map((event) => [event.kind, event.status, event.from.party])).toEqual([
      ['member_paused', 'spend_cap', 'system'],
      ['member_resumed', null, 'operator'],
      ['member_state', 'running', 'system'],
      ['hire_proposed', 'pending', 'member'],
      ['member_added', null, 'operator'],
      ['hire_decided', 'approved', 'operator'],
      ['delivery', 'delivered', 'system'],
      ['delivery', 'failed', 'operator']
    ])
    expect(feed().at(-2)).toMatchObject({
      channel: 'queue',
      subject: 'Run the standup',
      to: { member_ids: [jim.id] }
    })
  })

  it('pages by cursor and restarts a cursor older than what was pruned', () => {
    for (const subject of ['one', 'two', 'three']) {
      db.insertMessage({
        from: 'term_jim',
        to: `run:${team.run_id}`,
        subject,
        type: 'status',
        runId: team.run_id
      })
    }
    const first = readTeamActivityPage(db, db.requireTeam(team.id), {
      afterSequence: baseline,
      limit: 2
    })
    expect(first.events.map((event) => event.subject)).toEqual(['one', 'two'])
    expect(first).toMatchObject({ hasMore: true, reset: false })
    const rest = readTeamActivityPage(db, db.requireTeam(team.id), {
      afterSequence: first.latestSequence
    })
    expect(rest.events.map((event) => event.subject)).toEqual(['three'])
    expect(rest.hasMore).toBe(false)

    expect(db.pruneTeamActivity({ maxAgeDays: 30, maxRowsPerTeam: 1 })).toBeGreaterThan(0)
    const afterPrune = readTeamActivityPage(db, db.requireTeam(team.id), {
      afterSequence: baseline
    })
    expect(afterPrune.reset).toBe(true)
    expect(afterPrune.events.map((event) => event.subject)).toEqual(['three'])
    // Without a cursor the newest events come back, oldest first.
    expect(readTeamActivityPage(db, db.requireTeam(team.id), {}).events).toHaveLength(1)
  })
})

describe('team activity triggers', () => {
  function triggerCount(db: OrchestrationDb): number {
    return db.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_team_activity_%'"
      )
      .all().length
  }

  it('exist only once a database has a team, so a team-less one is never blocked by them', () => {
    const db = new OrchestrationDb(':memory:')
    try {
      expect(triggerCount(db)).toBe(0)
      // The core tables stay free to rebuild, as migration fixtures and future steps need.
      db.db.exec('ALTER TABLE dispatch_contexts DROP COLUMN creator_pane_key')
      db.db.exec('ALTER TABLE dispatch_contexts ADD COLUMN creator_pane_key TEXT')
      db.createTeam({ repoId: 'repo_1', name: 'Platform' })
      expect(triggerCount(db)).toBe(12)
    } finally {
      db.close()
    }
  })
})
