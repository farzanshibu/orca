import { describe, expect, it } from 'vitest'
import {
  groupTeamBoard,
  parseSqliteUtc,
  teamBoardColumn,
  teamGoalAction,
  visibleTeamTasks
} from './team-board-lanes'
import { makeTeamTask } from './team-snapshot-test-fixtures'
import type { TeamGoal, TeamTask } from './team-snapshot-types'

const NOW = Date.parse('2026-09-28T12:00:00Z')

function goal(overrides: Partial<TeamGoal> = {}): TeamGoal {
  return {
    id: 'goal_1',
    ref: 'bmt-1',
    title: 'Ship the importer',
    status: 'open',
    progress: { done: 0, total: 0 },
    review_requested_at: null,
    ...overrides
  }
}

function goalRow(id: string, overrides: Partial<TeamTask> = {}): TeamTask {
  return makeTeamTask({
    id,
    ref: 'bmt-1',
    kind: 'goal',
    task_title: 'Ship the importer',
    ...overrides
  })
}

function child(id: string, parentId: string, overrides: Partial<TeamTask> = {}): TeamTask {
  return makeTeamTask({ id, ref: id, kind: 'task', parent_id: parentId, ...overrides })
}

function laneIds(lanes: ReturnType<typeof groupTeamBoard>) {
  return lanes.map((lane) => [lane.goal?.id ?? null, lane.cards.map((card) => card.id)])
}

describe('parseSqliteUtc', () => {
  it('reads both timestamp shapes the host sends as the same instant', () => {
    expect(parseSqliteUtc('2026-09-28 12:00:00')).toBe(NOW)
    expect(parseSqliteUtc('2026-09-28T12:00:00.000Z')).toBe(NOW)
    expect(parseSqliteUtc('2026-09-28T14:00:00+02:00')).toBe(NOW)
    expect(parseSqliteUtc(null)).toBeNull()
    expect(parseSqliteUtc('soon')).toBeNull()
  })

  it('ages out a done card whose completion time is an ISO string', () => {
    const tasks = [
      makeTeamTask({ id: 'old', status: 'completed', completed_at: '2026-09-28T11:00:00.000Z' }),
      makeTeamTask({ id: 'new', status: 'completed', completed_at: '2026-09-28T11:45:00.000Z' })
    ]
    expect(visibleTeamTasks(tasks, NOW).map((task) => task.id)).toEqual(['new'])
  })
})

describe('teamBoardColumn', () => {
  it('files failed work with blocked work and unknown statuses under to do', () => {
    expect(teamBoardColumn('dispatched')).toBe('doing')
    expect(teamBoardColumn('failed')).toBe('blocked')
    expect(teamBoardColumn('blocked')).toBe('blocked')
    expect(teamBoardColumn('completed')).toBe('done')
    expect(teamBoardColumn('pending')).toBe('todo')
    expect(teamBoardColumn('in_review')).toBe('todo')
  })
})

describe('groupTeamBoard', () => {
  it('puts a goal’s tasks under it and never shows the goal as a card', () => {
    const tasks = [
      goalRow('goal_1'),
      child('task_a', 'goal_1', { status: 'dispatched' }),
      makeTeamTask({ id: 'task_loose', kind: 'task' }),
      child('task_b', 'goal_1')
    ]
    const lanes = groupTeamBoard({
      goals: [goal({ progress: { done: 0, total: 2 } })],
      tasks,
      now: NOW
    })
    expect(laneIds(lanes)).toEqual([
      ['goal_1', ['task_a', 'task_b']],
      [null, ['task_loose']]
    ])
    expect(lanes[0].goal).toMatchObject({ ref: 'bmt-1', progress: { done: 0, total: 2 } })
  })

  it('keeps an open goal with no tasks, and has no lane for tasks without a goal when there are none', () => {
    expect(
      laneIds(groupTeamBoard({ goals: [goal()], tasks: [goalRow('goal_1')], now: NOW }))
    ).toEqual([['goal_1', []]])
    expect(groupTeamBoard({ goals: [], tasks: [], now: NOW })).toEqual([])
  })

  it('works as a plain board for a host that sends no goals', () => {
    const tasks = [makeTeamTask({ id: 'task_a' }), makeTeamTask({ id: 'task_b', kind: 'task' })]
    expect(laneIds(groupTeamBoard({ goals: undefined, tasks, now: NOW }))).toEqual([
      [null, ['task_a', 'task_b']]
    ])
  })

  it('rebuilds a goal the snapshot left out from its task row', () => {
    const tasks = [
      goalRow('goal_old', { ref: 'bmt-4', task_title: null, spec: 'Tidy the docs\nand the index' }),
      child('task_a', 'goal_old', { status: 'completed', completed_at: null }),
      child('task_b', 'goal_old', { status: 'dispatched' })
    ]
    const [lane] = groupTeamBoard({ goals: [], tasks, now: NOW })
    expect(lane.goal).toEqual({
      id: 'goal_old',
      ref: 'bmt-4',
      title: 'Tidy the docs',
      status: 'open',
      progress: { done: 1, total: 2 },
      reviewRequested: false
    })
    expect(lane.cards.map((card) => card.id)).toEqual(['task_a', 'task_b'])
  })

  it('keeps a task whose parent is no goal the page knows as a task without a goal', () => {
    const tasks = [
      makeTeamTask({ id: 'task_parent', kind: 'task' }),
      child('task_sub', 'task_parent'),
      child('task_orphan', 'goal_gone')
    ]
    expect(laneIds(groupTeamBoard({ goals: [], tasks, now: NOW }))).toEqual([
      [null, ['task_parent', 'task_sub', 'task_orphan']]
    ])
  })

  it('lists open goals before closed ones and drops a closed goal once it has been closed a while', () => {
    const tasks = [
      goalRow('goal_done', { status: 'completed', completed_at: '2026-09-28T11:50:00.000Z' }),
      child('task_done', 'goal_done', {
        status: 'completed',
        completed_at: '2026-09-28T11:40:00.000Z'
      }),
      goalRow('goal_stale', { status: 'failed', completed_at: '2026-09-28T09:00:00.000Z' }),
      // A cancelled task is `failed`, which no done-card rule would ever age out.
      child('task_stale', 'goal_stale', { status: 'failed' }),
      goalRow('goal_open'),
      child('task_open', 'goal_open')
    ]
    const goals = [
      goal({ id: 'goal_done', status: 'completed' }),
      goal({ id: 'goal_stale', status: 'cancelled' }),
      goal({ id: 'goal_open' })
    ]
    expect(laneIds(groupTeamBoard({ goals, tasks, now: NOW }))).toEqual([
      ['goal_open', ['task_open']],
      ['goal_done', ['task_done']]
    ])
  })

  it('keeps a cancelled goal on the board while one of its tasks is still running', () => {
    const tasks = [
      goalRow('goal_1', { status: 'failed', completed_at: '2026-09-28T09:00:00.000Z' }),
      child('task_running', 'goal_1', { status: 'dispatched' }),
      child('task_cancelled', 'goal_1', { status: 'failed' })
    ]
    const lanes = groupTeamBoard({ goals: [goal({ status: 'cancelled' })], tasks, now: NOW })
    expect(laneIds(lanes)).toEqual([['goal_1', ['task_running', 'task_cancelled']]])
  })

  it('counts progress itself when the host sends none, and reads the review request', () => {
    const tasks = [
      goalRow('goal_1'),
      child('task_a', 'goal_1', { status: 'completed', completed_at: null }),
      child('task_b', 'goal_1', { status: 'failed' })
    ]
    const [lane] = groupTeamBoard({
      goals: [goal({ progress: undefined, review_requested_at: '2026-09-28 11:59:00' })],
      tasks,
      now: NOW
    })
    expect(lane.goal).toMatchObject({ progress: { done: 1, total: 2 }, reviewRequested: true })
  })
})

describe('teamGoalAction', () => {
  const action = (status: string, done: number, total: number) =>
    teamGoalAction({ status, progress: { done, total } })

  it('offers Close only once every task is done', () => {
    expect(action('open', 3, 3)).toBe('close')
    expect(action('open', 1, 1)).toBe('close')
  })

  it('offers Cancel while tasks are unfinished, failed, or not filed yet', () => {
    expect(action('open', 2, 3)).toBe('cancel')
    expect(action('open', 0, 3)).toBe('cancel')
    expect(action('open', 0, 0)).toBe('cancel')
  })

  it('offers nothing on a closed goal or one in a state this build does not know', () => {
    expect(action('completed', 3, 3)).toBeNull()
    expect(action('cancelled', 1, 3)).toBeNull()
    expect(action('archived', 0, 0)).toBeNull()
  })
})
