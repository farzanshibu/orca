import React, { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Check } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  whiteboardLineBudget,
  whiteboardLines,
  type WhiteboardContent,
  type WhiteboardLine
} from './office-floor-whiteboard-goal'
import { teamTaskStatusLabel } from './team-enum-labels'

function leftOutLabel(line: Extract<WhiteboardLine, { kind: 'more' }>): string {
  return [
    line.subtasks > 0
      ? translate('team.floor.whiteboard.moreTasks', '+{{count}} more', { count: line.subtasks })
      : null,
    line.goals > 0
      ? translate('team.floor.whiteboard.moreGoals', 'Other open goals: {{count}}', {
          count: line.goals
        })
      : null
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')
}

function BoardLine({ line }: { line: WhiteboardLine }): React.JSX.Element {
  if (line.kind === 'heading') {
    const { done, total } = line.progress
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="min-w-0 truncate font-semibold">{line.title}</span>
        <span data-whiteboard-progress="" className="shrink-0 text-muted-foreground tabular-nums">
          {total > 0
            ? translate('team.floor.whiteboard.progress', '{{done}}/{{total}}', { done, total })
            : translate('team.goalLane.noTasks', 'No tasks yet')}
        </span>
      </div>
    )
  }
  if (line.kind === 'more') {
    return (
      <div data-whiteboard-more="" className="truncate text-muted-foreground">
        {leftOutLabel(line)}
      </div>
    )
  }
  const { subtask } = line
  return (
    <div
      data-whiteboard-subtask={subtask.id}
      data-done={subtask.done ? 'true' : undefined}
      className="group flex items-center gap-1 data-[done=true]:text-muted-foreground"
    >
      <span className="flex size-3 shrink-0 items-center justify-center">
        {subtask.done ? (
          <Check className="size-3" aria-hidden="true" />
        ) : (
          <span className="size-1 rounded-full bg-current" />
        )}
      </span>
      {subtask.done ? <span className="sr-only">{teamTaskStatusLabel('completed')}</span> : null}
      {subtask.ref ? <span className="shrink-0 font-mono">{subtask.ref}</span> : null}
      <span className="min-w-0 truncate group-data-[done=true]:line-through">{subtask.title}</span>
    </div>
  )
}

/**
 * The whiteboard's writing for a known number of lines. Every line is one row of
 * `WHITEBOARD_LINE_PX`, so what the budget admits is exactly what fits.
 */
export function WhiteboardText({
  content,
  lineBudget
}: {
  content: WhiteboardContent
  lineBudget: number
}): React.JSX.Element {
  if (content.kind === 'empty') {
    return (
      <div
        data-whiteboard="empty"
        className="flex h-full items-center justify-center text-center leading-[14px] text-muted-foreground"
      >
        {translate('team.floor.whiteboard.empty', 'Give the manager a goal')}
      </div>
    )
  }
  return (
    <div data-whiteboard="goal" className="flex flex-col leading-[14px]">
      {whiteboardLines(content, lineBudget).map((line) => (
        <BoardLine key={line.kind === 'subtask' ? line.subtask.id : line.kind} line={line} />
      ))}
    </div>
  )
}

/** The element's height in CSS pixels, or null until it has been laid out. */
function useMeasuredHeight(element: RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const measured = element.current
    if (!measured) {
      return undefined
    }
    const measure = (value: number): void => setHeight((previous) => (value > 0 ? value : previous))
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.height))
    observer.observe(measured)
    measure(measured.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [element])
  return height
}

/**
 * What the whiteboard says, sized to the board as it is drawn. The board scales with the floor
 * while its type does not, so how many lines fit is measured here and nowhere assumed.
 */
export function FloorWhiteboard({ content }: { content: WhiteboardContent }): React.JSX.Element {
  const frame = useRef<HTMLDivElement>(null)
  const height = useMeasuredHeight(frame)
  return (
    <div ref={frame} className="h-full">
      <WhiteboardText
        content={content}
        // Unmeasured, only the heading is certain to fit.
        lineBudget={height === null ? 1 : whiteboardLineBudget(height)}
      />
    </div>
  )
}
