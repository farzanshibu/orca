import React from 'react'
import { Check, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { translate } from '@/i18n/i18n'
import { teamGoalAction, type TeamBoardGoal } from './team-board-lanes'
import { teamGoalStatusLabel } from './team-enum-labels'

/** A goal as the heading of its lane: what it is, how far along, and the one action it allows now. */
export function TeamBoardGoalHeader({
  goal,
  busy,
  onClose,
  onCancel
}: {
  goal: TeamBoardGoal
  busy: boolean
  onClose: (goal: TeamBoardGoal) => void
  /** Asks for confirmation first; nothing is cancelled by this click. */
  onCancel: (goal: TeamBoardGoal) => void
}): React.JSX.Element {
  const { done, total } = goal.progress
  const action = teamGoalAction(goal)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <Target className="size-3.5 shrink-0 text-muted-foreground" />
      {goal.ref ? (
        <span className="font-mono text-[11px] text-muted-foreground">{goal.ref}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{goal.title}</span>
      {goal.status !== 'open' ? (
        <Badge variant="outline">{teamGoalStatusLabel(goal.status)}</Badge>
      ) : goal.reviewRequested ? (
        <Badge variant="secondary">
          {translate('team.goalLane.reviewRequested', 'Manager asked to review')}
        </Badge>
      ) : null}
      <span className="text-[12px] text-muted-foreground tabular-nums">
        {total > 0
          ? translate('team.goalLane.progress', '{{done}} of {{total}} done', { done, total })
          : translate('team.goalLane.noTasks', 'No tasks yet')}
      </span>
      {total > 0 ? <Progress value={(done / total) * 100} className="h-1.5 w-20" /> : null}
      {action === 'close' ? (
        <Button size="xs" variant="secondary" disabled={busy} onClick={() => onClose(goal)}>
          <Check />
          {translate('team.goalLane.close', 'Close goal')}
        </Button>
      ) : null}
      {action === 'cancel' ? (
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => onCancel(goal)}>
          {translate('team.goalLane.cancel', 'Cancel goal')}
        </Button>
      ) : null}
    </div>
  )
}
