import React from 'react'
import { translate } from '@/i18n/i18n'
import { TeamBoardGoalHeader } from './TeamBoardGoalHeader'
import { TeamTaskCard } from './TeamTaskCard'
import {
  canAssignTeamTask,
  isTeamAssignRecordCurrent,
  teamAssignNote,
  teamTaskStandingWait,
  type TeamAssignNote,
  type TeamAssignRecord
} from './team-assign-outcome'
import {
  TEAM_BOARD_COLUMNS,
  teamBoardColumn,
  type TeamBoardColumn,
  type TeamBoardGoal,
  type TeamBoardLane
} from './team-board-lanes'
import { teamWaitReasonLabel } from './team-enum-labels'
import type { TeamMember, TeamTask } from './team-snapshot-types'
import { teamTaskOwner } from './team-task-owner'

export { parseSqliteUtc, visibleTeamTasks } from './team-board-lanes'

export const teamTaskActionKey = (taskId: string): string => `task:${taskId}`
export const teamGoalActionKey = (goalId: string): string => `goal:${goalId}`

function columnLabel(column: TeamBoardColumn): string {
  switch (column) {
    case 'todo':
      return translate('team.tasks.todo', 'To do')
    case 'doing':
      return translate('team.tasks.doing', 'Doing')
    case 'blocked':
      return translate('team.tasks.blocked', 'Blocked')
    case 'done':
      return translate('team.tasks.done', 'Done')
  }
}

export type TeamTaskBoardProps = {
  lanes: readonly TeamBoardLane[]
  /** Every task of the team, not only the cards shown: a wait reason is read against all of them. */
  tasks: readonly TeamTask[]
  members: readonly TeamMember[]
  /** Who a task can go to; empty on a host that takes no assignments. */
  assignees: readonly TeamMember[]
  pendingActions: readonly string[]
  /** What the host answered for each assignment made from this board, by task id. */
  assignRecords: ReadonlyMap<string, TeamAssignRecord>
  onAssign: (task: TeamTask, memberId: string | null) => void
  onCloseGoal: (goal: TeamBoardGoal) => void
  onCancelGoal: (goal: TeamBoardGoal) => void
}

function cardNote(
  task: TeamTask,
  owner: TeamMember | undefined,
  props: Pick<TeamTaskBoardProps, 'assignRecords' | 'tasks'>
): TeamAssignNote | null {
  const record = props.assignRecords.get(task.id)
  if (record && isTeamAssignRecordCurrent(task, record)) {
    return teamAssignNote(record.result)
  }
  const standing = teamTaskStandingWait(task, owner, props.tasks)
  return standing ? { tone: 'neutral', text: teamWaitReasonLabel(standing) } : null
}

export function TeamTaskBoard(props: TeamTaskBoardProps): React.JSX.Element {
  const { lanes, members, assignees, pendingActions } = props
  if (lanes.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {translate(
          'team.tasks.empty',
          'No goals or tasks yet. Use New goal to hand the manager something to plan, or add a single task above.'
        )}
      </p>
    )
  }
  const cards = lanes.flatMap((lane) => lane.cards)
  const hasGoals = lanes.some((lane) => lane.goal)
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto">
      <div className="flex min-w-[880px] flex-col gap-3">
        <div className="sticky top-0 z-10 grid grid-cols-4 gap-3 bg-background px-2 py-1">
          {TEAM_BOARD_COLUMNS.map((column) => (
            <div key={column} className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {columnLabel(column)}
              </span>
              <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                {cards.filter((task) => teamBoardColumn(task.status) === column).length}
              </span>
            </div>
          ))}
        </div>
        {lanes.map((lane) => (
          <section
            key={lane.goal?.id ?? 'no-goal'}
            className="rounded-xl border border-border/60 bg-muted/30"
          >
            {lane.goal ? (
              <TeamBoardGoalHeader
                goal={lane.goal}
                busy={pendingActions.includes(teamGoalActionKey(lane.goal.id))}
                onClose={props.onCloseGoal}
                onCancel={props.onCancelGoal}
              />
            ) : hasGoals ? (
              <div className="px-3 py-2 text-[13px] font-medium">
                {translate('team.tasks.noGoalLane', 'Tasks without a goal')}
              </div>
            ) : (
              <div className="h-2" />
            )}
            {lane.cards.length === 0 && lane.goal?.progress.total === 0 ? (
              <p className="px-3 pb-2 text-[12px] text-muted-foreground">
                {translate('team.tasks.goalUnplanned', 'No tasks filed under this goal yet.')}
              </p>
            ) : null}
            <div className="grid grid-cols-4 gap-3 px-2 pb-2">
              {TEAM_BOARD_COLUMNS.map((column) => (
                <div key={column} className="flex min-w-0 flex-col gap-2">
                  {lane.cards
                    .filter((task) => teamBoardColumn(task.status) === column)
                    .map((task) => {
                      const owner = teamTaskOwner(task, members)
                      return (
                        <TeamTaskCard
                          key={task.id}
                          task={task}
                          owner={owner}
                          assignees={canAssignTeamTask(task) ? assignees : []}
                          busy={pendingActions.includes(teamTaskActionKey(task.id))}
                          note={cardNote(task, owner, props)}
                          onAssign={props.onAssign}
                        />
                      )
                    })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
