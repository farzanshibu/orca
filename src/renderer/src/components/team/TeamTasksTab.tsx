import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { TeamGoalCancelDialog } from './TeamGoalCancelDialog'
import { TeamTaskBoard, teamGoalActionKey, teamTaskActionKey } from './TeamTaskBoard'
import { TeamTaskComposer } from './TeamTaskComposer'
import { assignableTeamMembers, type TeamAssignRecord } from './team-assign-outcome'
import { groupTeamBoard, type TeamBoardGoal } from './team-board-lanes'
import { runTeamActionInline, teamActionErrorMessage } from './team-inline-action'
import { assignTeamTask, closeTeamGoal } from './team-runtime-client'
import type { TeamSnapshot, TeamTask } from './team-snapshot-types'
import { useTeamFanoutSupport } from './use-team-fanout-support'
import type { TeamAct } from './use-team-page-state'

const TASK_CREATE_ACTION = 'task-create'

export function TeamTasksTab({
  target,
  snapshot,
  now,
  pendingActions,
  act
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  now: number
  pendingActions: readonly string[]
  act: TeamAct
}): React.JSX.Element {
  const team = snapshot.team.id
  const support = useTeamFanoutSupport(target)
  const [assignRecords, setAssignRecords] = useState<ReadonlyMap<string, TeamAssignRecord>>(
    () => new Map()
  )
  const [cancelling, setCancelling] = useState<TeamBoardGoal | null>(null)
  const lanes = useMemo(
    () => groupTeamBoard({ goals: snapshot.goals, tasks: snapshot.tasks, now }),
    [snapshot.goals, snapshot.tasks, now]
  )
  const assignees = useMemo(
    // An older host has no assign call, so its board offers none.
    () => (support === 'unsupported' ? [] : assignableTeamMembers(snapshot.members)),
    [snapshot.members, support]
  )

  const assign = (task: TeamTask, memberId: string | null): void => {
    void act(async () => {
      const result = await assignTeamTask(
        target,
        memberId
          ? { team, task: task.id, member: memberId }
          : { team, task: task.id, unassign: true }
      )
      setAssignRecords((records) => {
        const next = new Map(records)
        if (memberId) {
          next.set(task.id, { memberId, result })
        } else {
          next.delete(task.id)
        }
        return next
      })
    }, teamTaskActionKey(task.id))
  }

  const cancelGoal = async (goal: TeamBoardGoal): Promise<string | null> => {
    const outcome = await runTeamActionInline(act, teamGoalActionKey(goal.id), () =>
      closeTeamGoal(target, { team, goal: goal.id, cancel: true })
    )
    if (!outcome.ok) {
      return teamActionErrorMessage(outcome.error)
    }
    toast.message(
      translate(
        'team.goalCancel.done',
        'Goal {{goal}} cancelled. Tasks cancelled: {{cancelled}}. Still running: {{running}}.',
        {
          goal: outcome.value.ref ?? goal.title,
          cancelled: outcome.value.cancelledTasks,
          running: outcome.value.runningTasks
        }
      )
    )
    setCancelling(null)
    return null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <TeamTaskComposer
        target={target}
        teamId={team}
        busy={pendingActions.includes(TASK_CREATE_ACTION)}
        act={(mutation) => act(mutation, TASK_CREATE_ACTION)}
      />
      <TeamTaskBoard
        lanes={lanes}
        tasks={snapshot.tasks}
        members={snapshot.members}
        assignees={assignees}
        pendingActions={pendingActions}
        assignRecords={assignRecords}
        onAssign={assign}
        onCloseGoal={(goal) =>
          void act(() => closeTeamGoal(target, { team, goal: goal.id }), teamGoalActionKey(goal.id))
        }
        onCancelGoal={setCancelling}
      />
      {cancelling ? (
        <TeamGoalCancelDialog
          key={cancelling.id}
          goal={cancelling}
          busy={pendingActions.includes(teamGoalActionKey(cancelling.id))}
          onConfirm={cancelGoal}
          onDismiss={() => setCancelling(null)}
        />
      ) : null}
    </div>
  )
}
