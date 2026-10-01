import { describe, expect, it } from 'vitest'
import { officeFloorPlan } from './office-floor-plan'
import { finishedGoalTasks, stagedBoxes } from './office-floor-staged-boxes'
import { stagingBoxSpots } from './office-floor-warehouse'
import { makeTeamTask } from './team-snapshot-test-fixtures'
import type { TeamGoal, TeamTask } from './team-snapshot-types'

const { staging } = officeFloorPlan('wide', 1).fixtures

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

function child(id: string, parentId: string, status: string): TeamTask {
  return makeTeamTask({ id, ref: id, kind: 'task', parent_id: parentId, status })
}

describe('stagedBoxes', () => {
  it('leaves the staging area empty while nothing is finished', () => {
    expect(stagedBoxes(staging, 0)).toEqual({ spots: [], overflowCount: null })
  })

  it('stacks one box per finished task, floor layer first', () => {
    const spots = stagingBoxSpots(staging)
    expect(stagedBoxes(staging, 5)).toEqual({ spots: spots.slice(0, 5), overflowCount: null })
    expect(new Set(stagedBoxes(staging, 5).spots.map((spot) => spot.y)).size).toBe(1)
  })

  it('fills the staging area at twelve without a count', () => {
    const { spots, overflowCount } = stagedBoxes(staging, 12)
    expect(spots).toHaveLength(12)
    expect(overflowCount).toBeNull()
  })

  it('draws twelve boxes and writes out the whole count past that', () => {
    expect(stagedBoxes(staging, 13)).toMatchObject({ overflowCount: 13 })
    expect(stagedBoxes(staging, 13).spots).toHaveLength(12)
    expect(stagedBoxes(staging, 40)).toMatchObject({ overflowCount: 40 })
    expect(stagedBoxes(staging, 40).spots).toHaveLength(12)
  })

  it('does the same on every floor', () => {
    for (const variant of ['narrow', 'medium', 'wide'] as const) {
      const area = officeFloorPlan(variant, 2).fixtures.staging
      expect(stagedBoxes(area, 30).spots, variant).toHaveLength(12)
    }
  })
})

describe('finishedGoalTasks', () => {
  it('adds up what the open goals report as done', () => {
    const goals = [
      goal({ id: 'goal_a', progress: { done: 2, total: 5 } }),
      goal({ id: 'goal_b', progress: { done: 3, total: 3 } })
    ]
    expect(finishedGoalTasks(goals, [])).toBe(5)
  })

  it('counts the tasks itself when the host sends no progress', () => {
    const tasks = [
      child('a', 'goal_1', 'completed'),
      child('b', 'goal_1', 'completed'),
      child('c', 'goal_1', 'dispatched'),
      child('d', 'goal_1', 'failed')
    ]
    expect(finishedGoalTasks([goal({ progress: undefined })], tasks)).toBe(2)
  })

  it('ships a goal’s boxes out when it closes, and never stages work filed under no goal', () => {
    const goals = [
      goal({ id: 'goal_done', status: 'completed', progress: { done: 4, total: 4 } }),
      goal({ id: 'goal_gone', status: 'cancelled', progress: { done: 1, total: 3 } }),
      goal({ id: 'goal_open', progress: { done: 1, total: 2 } })
    ]
    const tasks = [makeTeamTask({ id: 'loose', kind: 'task', status: 'completed' })]
    expect(finishedGoalTasks(goals, tasks)).toBe(1)
    expect(finishedGoalTasks(undefined, tasks)).toBe(0)
  })
})
