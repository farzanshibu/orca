// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FloorOverlay } from './office-floor-overlay'
import { officeFloorPlan } from './office-floor-plan'
import { FloorWhiteboard, WhiteboardText } from './office-floor-whiteboard'
import { WHITEBOARD_LINE_PX, type WhiteboardGoal } from './office-floor-whiteboard-goal'

const GOAL: WhiteboardGoal = {
  kind: 'goal',
  id: 'goal_1',
  title: 'Ship the CSV importer',
  progress: { done: 1, total: 4 },
  subtasks: [
    { id: 'task_a', ref: 'imp-12', title: 'Parse quoted fields', done: true },
    { id: 'task_b', ref: 'imp-13', title: 'Streaming upload', done: false },
    { id: 'task_c', ref: null, title: 'Error report', done: false },
    { id: 'task_d', ref: 'imp-15', title: 'Docs', done: false }
  ],
  otherGoals: 0
}

function count(markup: string, attribute: string): number {
  return markup.split(` ${attribute}=`).length - 1
}

describe('WhiteboardText', () => {
  it('writes the goal, its progress and a line per task', () => {
    const markup = renderToStaticMarkup(<WhiteboardText content={GOAL} lineBudget={5} />)
    expect(markup).toContain('data-whiteboard="goal"')
    expect(markup).toContain('Ship the CSV importer')
    expect(markup).toContain('1/4')
    expect(count(markup, 'data-whiteboard-subtask')).toBe(4)
    expect(markup).toContain('imp-13')
    expect(markup).toContain('Streaming upload')
    expect(markup).not.toContain('data-whiteboard-more')
  })

  it('ticks and strikes a finished task, and only that one', () => {
    const markup = renderToStaticMarkup(<WhiteboardText content={GOAL} lineBudget={5} />)
    expect(count(markup, 'data-done')).toBe(1)
    expect(markup).toMatch(/data-whiteboard-subtask="task_a" data-done="true"/)
    expect(markup).toContain('group-data-[done=true]:line-through')
    // A screen reader hears the state the strike-through shows.
    expect(markup).toContain('<span class="sr-only">Done</span>')
  })

  it('writes fewer tasks and a count when the board is short', () => {
    const markup = renderToStaticMarkup(<WhiteboardText content={GOAL} lineBudget={3} />)
    expect(count(markup, 'data-whiteboard-subtask')).toBe(1)
    expect(markup).toContain('data-whiteboard-more')
    expect(markup).toContain('+3 more')
  })

  it('says how many other goals are open', () => {
    const markup = renderToStaticMarkup(
      <WhiteboardText content={{ ...GOAL, subtasks: [], otherGoals: 2 }} lineBudget={4} />
    )
    expect(markup).toContain('Other open goals: 2')
  })

  it('says so when a goal has no tasks yet', () => {
    const markup = renderToStaticMarkup(
      <WhiteboardText
        content={{ ...GOAL, subtasks: [], progress: { done: 0, total: 0 } }}
        lineBudget={4}
      />
    )
    expect(markup).toContain('No tasks yet')
    expect(markup).not.toContain('0/0')
  })

  it('invites a goal when there is none', () => {
    const markup = renderToStaticMarkup(
      <WhiteboardText content={{ kind: 'empty' }} lineBudget={4} />
    )
    expect(markup).toContain('data-whiteboard="empty"')
    expect(markup).toContain('Give the manager a goal')
  })

  it('keeps every line to one row of the height the budget is counted in', () => {
    const markup = renderToStaticMarkup(
      <WhiteboardText
        content={{ ...GOAL, title: `Rebuild the importer ${'again '.repeat(60)}` }}
        lineBudget={5}
      />
    )
    expect(markup).toContain(`leading-[${WHITEBOARD_LINE_PX}px]`)
    // Title and task names cut off with an ellipsis instead of wrapping onto a second row.
    expect(markup.split('truncate').length - 1).toBe(5)
    expect(markup).not.toMatch(/text-\[(?:[0-9]|10)(?:\.\d+)?px\]/)
  })
})

describe('FloorWhiteboard', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('writes only the heading until the board has been measured', () => {
    const markup = renderToStaticMarkup(<FloorWhiteboard content={GOAL} />)
    expect(markup).toContain('Ship the CSV importer')
    expect(count(markup, 'data-whiteboard-subtask')).toBe(0)
  })

  it('fits the lines to the board’s measured height, and again when the floor is resized', () => {
    let resizeTo: (height: number) => void = () => undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(report: (entries: { contentRect: { height: number } }[]) => void) {
          resizeTo = (height) => report([{ contentRect: { height } }])
        }
        observe(): void {}
        disconnect(): void {}
      }
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, WHITEBOARD_LINE_PX * 4 + 10)
    )
    const view = render(<FloorWhiteboard content={GOAL} />)
    const shown = (): number => view.container.querySelectorAll('[data-whiteboard-subtask]').length
    const more = (): string | null | undefined =>
      view.container.querySelector('[data-whiteboard-more]')?.textContent
    // Four lines: the heading, two tasks, and the count of the two left out.
    expect(shown()).toBe(2)
    expect(more()).toBe('+2 more')

    act(() => resizeTo(WHITEBOARD_LINE_PX * 5))
    expect(shown()).toBe(4)
    expect(more()).toBeUndefined()

    act(() => resizeTo(WHITEBOARD_LINE_PX * 2 - 1))
    expect(shown()).toBe(0)
    expect(more()).toBeUndefined()
    // A board that is not laid out reports no height; what was written stays.
    act(() => resizeTo(WHITEBOARD_LINE_PX * 3))
    act(() => resizeTo(0))
    expect(shown()).toBe(1)
    expect(more()).toBe('+3 more')
  })

  it('goes on the board through the overlay, at the overlay’s 11px', () => {
    const plan = officeFloorPlan('wide', 1)
    const markup = renderToStaticMarkup(
      <FloorOverlay
        plan={plan}
        teamName="Platform"
        whiteboard={<WhiteboardText content={GOAL} lineBudget={4} />}
        nameplates={[]}
        badges={[]}
      />
    )
    const board = markup.indexOf(`left:${(plan.fixtures.whiteboard.x / plan.width) * 100}%`)
    expect(board).toBeGreaterThan(-1)
    expect(markup.indexOf('data-whiteboard="goal"')).toBeGreaterThan(board)
    expect(markup.slice(board, markup.indexOf('data-whiteboard="goal"'))).toContain('text-[11px]')
  })
})
