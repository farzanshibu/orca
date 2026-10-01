import { describe, expect, it } from 'vitest'
import {
  WHITEBOARD_LINE_PX,
  whiteboardContent,
  whiteboardLineBudget,
  whiteboardLines,
  type WhiteboardGoal,
  type WhiteboardLine
} from './office-floor-whiteboard-goal'
import { makeTeamTask } from './team-snapshot-test-fixtures'
import type { TeamGoal, TeamTask } from './team-snapshot-types'

function goal(overrides: Partial<TeamGoal> = {}): TeamGoal {
  return {
    id: 'goal_1',
    ref: 'imp-1',
    title: 'Ship the importer',
    status: 'open',
    progress: { done: 0, total: 0 },
    review_requested_at: null,
    ...overrides
  }
}

function child(id: string, parentId: string, overrides: Partial<TeamTask> = {}): TeamTask {
  return makeTeamTask({ id, ref: id, kind: 'task', parent_id: parentId, ...overrides })
}

function board(subtasks: readonly boolean[], otherGoals = 0): WhiteboardGoal {
  return {
    kind: 'goal',
    id: 'goal_1',
    title: 'Ship the importer',
    progress: { done: subtasks.filter(Boolean).length, total: subtasks.length },
    subtasks: subtasks.map((done, index) => ({
      id: `task_${index}`,
      ref: `imp-${index}`,
      title: `Task ${index}`,
      done
    })),
    otherGoals
  }
}

/** A line as a short tag: `H`, a subtask's index, or `+tasks/goals`. */
function tags(lines: readonly WhiteboardLine[]): string[] {
  return lines.map((line) => {
    if (line.kind === 'heading') {
      return 'H'
    }
    return line.kind === 'subtask'
      ? line.subtask.id.replace('task_', '')
      : `+${line.subtasks}/${line.goals}`
  })
}

describe('whiteboardContent', () => {
  it('invites a goal when the team has a manager and nothing open', () => {
    expect(whiteboardContent({ goals: [], tasks: [], hasManager: true })).toEqual({ kind: 'empty' })
    expect(
      whiteboardContent({ goals: [goal({ status: 'completed' })], tasks: [], hasManager: true })
    ).toEqual({ kind: 'empty' })
  })

  it('leaves the board to its scribbles when there is nobody to give a goal to, or no goals to know of', () => {
    expect(whiteboardContent({ goals: [], tasks: [], hasManager: false })).toBeNull()
    expect(whiteboardContent({ goals: undefined, tasks: [], hasManager: true })).toBeNull()
  })

  it('writes up the one open goal with its tasks in filed order, done ones marked', () => {
    const tasks = [
      makeTeamTask({ id: 'goal_1', kind: 'goal' }),
      child('imp-2', 'goal_1', { task_title: 'Parse quoted fields', status: 'completed' }),
      child('imp-3', 'goal_1', { task_title: 'Streaming upload', status: 'dispatched' }),
      child('imp-4', 'goal_1', { task_title: 'Error report', status: 'failed' }),
      makeTeamTask({ id: 'loose', kind: 'task' })
    ]
    expect(
      whiteboardContent({
        goals: [goal({ progress: { done: 1, total: 3 } })],
        tasks,
        hasManager: true
      })
    ).toEqual({
      kind: 'goal',
      id: 'goal_1',
      title: 'Ship the importer',
      progress: { done: 1, total: 3 },
      subtasks: [
        { id: 'imp-2', ref: 'imp-2', title: 'Parse quoted fields', done: true },
        { id: 'imp-3', ref: 'imp-3', title: 'Streaming upload', done: false },
        { id: 'imp-4', ref: 'imp-4', title: 'Error report', done: false }
      ],
      otherGoals: 0
    })
  })

  it('keeps a task that finished long ago, unlike the Tasks tab', () => {
    const tasks = [
      child('imp-2', 'goal_1', { status: 'completed', completed_at: '2020-01-01 00:00:00' })
    ]
    const content = whiteboardContent({ goals: [goal()], tasks, hasManager: true })
    expect(content).toMatchObject({ subtasks: [{ id: 'imp-2', done: true }] })
  })

  it('shows the newest of several open goals and counts the others', () => {
    const goals = [
      goal({ id: 'goal_a', title: 'First' }),
      goal({ id: 'goal_closed', title: 'Closed', status: 'cancelled' }),
      goal({ id: 'goal_b', title: 'Second' }),
      goal({ id: 'goal_c', title: 'Third' })
    ]
    const tasks = [child('a-1', 'goal_a'), child('c-1', 'goal_c')]
    expect(whiteboardContent({ goals, tasks, hasManager: true })).toMatchObject({
      id: 'goal_c',
      title: 'Third',
      subtasks: [{ id: 'c-1' }],
      otherGoals: 2
    })
  })

  it('shows a goal even on a team whose manager is gone, and one only its task row tells of', () => {
    const tasks = [
      makeTeamTask({ id: 'goal_old', kind: 'goal', task_title: 'Tidy the docs' }),
      child('doc-1', 'goal_old')
    ]
    expect(whiteboardContent({ goals: undefined, tasks, hasManager: false })).toMatchObject({
      kind: 'goal',
      id: 'goal_old',
      title: 'Tidy the docs',
      progress: { done: 0, total: 1 }
    })
  })

  it('puts a long or multi-line title on one line', () => {
    const title = `Rebuild   the importer\nso that ${'very '.repeat(40)}large files stream`
    const tasks = [
      child('imp-2', 'goal_1', { task_title: null, spec: '  Parse\tquoted fields \nand more' })
    ]
    const content = whiteboardContent({ goals: [goal({ title })], tasks, hasManager: true })
    expect(content).toMatchObject({ subtasks: [{ title: 'Parse quoted fields' }] })
    expect(content?.kind === 'goal' && content.title).toMatch(/^Rebuild the importer so that very /)
    expect(content?.kind === 'goal' && /\s{2,}|\n/.test(content.title)).toBe(false)
  })
})

describe('whiteboardLineBudget', () => {
  it('counts whole lines only and never drops the heading', () => {
    expect(whiteboardLineBudget(WHITEBOARD_LINE_PX * 4)).toBe(4)
    expect(whiteboardLineBudget(WHITEBOARD_LINE_PX * 4 - 0.5)).toBe(3)
    expect(whiteboardLineBudget(WHITEBOARD_LINE_PX * 4 + 13)).toBe(4)
    expect(whiteboardLineBudget(5)).toBe(1)
    expect(whiteboardLineBudget(0)).toBe(1)
  })

  it('gives a wide floor more lines than a 330px one', () => {
    // The board is 34 art units tall, less 8px of padding.
    const writable = (pxPerUnit: number): number => 34 * pxPerUnit - 8
    expect(whiteboardLineBudget(writable(2.18))).toBe(4)
    expect(whiteboardLineBudget(writable(330 / 176))).toBe(3)
  })
})

describe('whiteboardLines', () => {
  it('lists every task when they fit', () => {
    expect(tags(whiteboardLines(board([true, false, false]), 4))).toEqual(['H', '0', '1', '2'])
    expect(tags(whiteboardLines(board([]), 4))).toEqual(['H'])
  })

  it('never writes more lines than the budget, whatever the goal', () => {
    for (let budget = 0; budget <= 8; budget += 1) {
      for (let count = 0; count <= 9; count += 1) {
        for (const otherGoals of [0, 2]) {
          const done = Array.from({ length: count }, (_, index) => index % 2 === 0)
          const lines = whiteboardLines(board(done, otherGoals), budget)
          const label = `${count} tasks, ${otherGoals} other goals, ${budget} lines`
          expect(lines.length, label).toBeLessThanOrEqual(Math.max(1, budget))
          expect(lines[0].kind, label).toBe('heading')
          const shown = lines.filter((line) => line.kind === 'subtask').length
          const more = lines.find((line) => line.kind === 'more')
          // Nothing goes missing without being counted, while there is a line to count it on.
          if (budget >= 2) {
            expect(shown + (more?.kind === 'more' ? more.subtasks : 0), label).toBe(count)
            expect(more?.kind === 'more' ? more.goals : 0, label).toBe(otherGoals)
          }
        }
      }
    }
  })

  it('shows fewer tasks and counts the rest rather than clipping', () => {
    expect(tags(whiteboardLines(board([false, false, false, false]), 4))).toEqual([
      'H',
      '0',
      '1',
      '+2/0'
    ])
    expect(tags(whiteboardLines(board([false, false, false, false]), 3))).toEqual([
      'H',
      '0',
      '+3/0'
    ])
    expect(tags(whiteboardLines(board([false, false]), 2))).toEqual(['H', '+2/0'])
    expect(tags(whiteboardLines(board([false, false]), 1))).toEqual(['H'])
  })

  it('keeps unfinished tasks ahead of finished ones when not all fit, in filed order', () => {
    expect(tags(whiteboardLines(board([true, true, false, true, false]), 4))).toEqual([
      'H',
      '2',
      '4',
      '+3/0'
    ])
    expect(tags(whiteboardLines(board([true, false, true, true]), 4))).toEqual([
      'H',
      '0',
      '1',
      '+2/0'
    ])
  })

  it('spends a line on the other open goals', () => {
    expect(tags(whiteboardLines(board([false, false], 2), 4))).toEqual(['H', '0', '1', '+0/2'])
    expect(tags(whiteboardLines(board([false, false, false], 2), 4))).toEqual([
      'H',
      '0',
      '1',
      '+1/2'
    ])
    expect(tags(whiteboardLines(board([], 1), 2))).toEqual(['H', '+0/1'])
  })
})
