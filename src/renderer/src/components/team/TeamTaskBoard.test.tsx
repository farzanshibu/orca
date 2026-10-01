import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TeamTaskBoard, type TeamTaskBoardProps } from './TeamTaskBoard'
import { groupTeamBoard } from './team-board-lanes'
import { makeTeamMember, makeTeamTask } from './team-snapshot-test-fixtures'
import type { TeamGoal, TeamTask } from './team-snapshot-types'

const NOW = Date.parse('2026-09-28T12:00:00Z')
const ada = makeTeamMember({ id: 'member_ada', display_name: 'Ada', waiting_reason: 'member_busy' })

function boardMarkup(
  goals: TeamGoal[],
  tasks: TeamTask[],
  overrides: Partial<TeamTaskBoardProps> = {}
): string {
  return renderToStaticMarkup(
    <TeamTaskBoard
      lanes={groupTeamBoard({ goals, tasks, now: NOW })}
      tasks={tasks}
      members={[ada]}
      assignees={[ada]}
      pendingActions={[]}
      assignRecords={new Map()}
      onAssign={() => undefined}
      onCloseGoal={() => undefined}
      onCancelGoal={() => undefined}
      {...overrides}
    />
  )
}

const goalRow = makeTeamTask({ id: 'goal_1', ref: 'bmt-1', kind: 'goal' })
const openGoal: TeamGoal = {
  id: 'goal_1',
  ref: 'bmt-1',
  title: 'Ship the importer',
  status: 'open',
  progress: { done: 1, total: 2 },
  review_requested_at: null
}

describe('TeamTaskBoard', () => {
  it('heads a goal’s tasks with the goal, its progress and Cancel while work is unfinished', () => {
    const tasks = [
      goalRow,
      makeTeamTask({ id: 'task_a', ref: 'bmt-2', parent_id: 'goal_1', task_title: 'Stream rows' }),
      makeTeamTask({ id: 'task_loose', ref: 'bmt-9', task_title: 'Fix the typo' })
    ]
    const markup = boardMarkup([openGoal], tasks)
    expect(markup).toContain('Ship the importer')
    expect(markup).toContain('1 of 2 done')
    expect(markup).toContain('Cancel goal')
    expect(markup).not.toContain('Close goal')
    expect(markup).toContain('Tasks without a goal')
    expect(markup.indexOf('Stream rows')).toBeLessThan(markup.indexOf('Tasks without a goal'))
    expect(markup.indexOf('Fix the typo')).toBeGreaterThan(markup.indexOf('Tasks without a goal'))
  })

  it('offers Close, and says the manager was asked to review, once every task is done', () => {
    const done = makeTeamTask({ id: 'task_a', parent_id: 'goal_1', status: 'completed' })
    const markup = boardMarkup(
      [
        { ...openGoal, progress: { done: 1, total: 1 }, review_requested_at: '2026-09-28 11:59:00' }
      ],
      [goalRow, done]
    )
    expect(markup).toContain('Close goal')
    expect(markup).not.toContain('Cancel goal')
    expect(markup).toContain('Manager asked to review')
  })

  it('shows a closed goal’s status and no action on it', () => {
    const closedRow = { ...goalRow, status: 'failed', completed_at: '2026-09-28T11:55:00.000Z' }
    const markup = boardMarkup([{ ...openGoal, status: 'cancelled' }], [closedRow])
    expect(markup).toContain('Cancelled')
    expect(markup).not.toContain('Cancel goal')
    expect(markup).not.toContain('Close goal')
  })

  it('says why an assigned card waits, and what the last assignment did', () => {
    const waiting = makeTeamTask({ id: 'task_a', assignee_member_id: 'member_ada' })
    expect(boardMarkup([], [waiting])).toContain('Finishing another task')
    const failed = boardMarkup([], [waiting], {
      assignRecords: new Map([
        [
          'task_a',
          {
            memberId: 'member_ada',
            result: {
              taskId: 'task_a',
              ref: 'bmt-1',
              member: 'ada',
              assigned: true,
              started: false,
              error: 'The worker did not start.'
            }
          }
        ]
      ])
    })
    expect(failed).toContain('Could not start: The worker did not start.')
    expect(failed).not.toContain('Finishing another task')
  })

  it('stays a plain board, with no lane heading, when the team has no goals', () => {
    const markup = boardMarkup([], [makeTeamTask({ id: 'task_a', task_title: 'Fix the typo' })])
    expect(markup).toContain('Fix the typo')
    expect(markup).not.toContain('Tasks without a goal')
  })

  it('points at New goal when there is nothing on the board', () => {
    expect(boardMarkup([], [])).toContain('No goals or tasks yet')
  })
})
