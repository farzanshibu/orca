import React, { useRef, useState } from 'react'
import { Ban, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { TeamBoardGoal } from './team-board-lanes'
import { useDelayedSpinner } from './use-delayed-spinner'

/** Confirms stopping a goal. Mounted per goal, so a failure never carries over to another one. */
export function TeamGoalCancelDialog({
  goal,
  busy,
  onConfirm,
  onDismiss
}: {
  goal: TeamBoardGoal
  busy: boolean
  /** Resolves to why the host refused, or null once the goal is cancelled. */
  onConfirm: (goal: TeamBoardGoal) => Promise<string | null>
  onDismiss: () => void
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const spinning = useDelayedSpinner(busy)
  return (
    // Stays up while the request is out: dismissed, its failure would have nowhere to show.
    <Dialog open onOpenChange={(open) => (open || busy ? undefined : onDismiss())}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          confirmButton.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('team.goalCancel.title', 'Cancel goal {{goal}}?', {
              goal: goal.ref ?? goal.id
            })}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'team.goalCancel.description',
              'Its tasks that have not started are cancelled with it. Tasks already running finish on their own. This cannot be undone.'
            )}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[13px] break-words">
          {goal.title}
        </p>
        {error ? (
          <p role="alert" className="text-[12px] break-words text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onDismiss}>
            {translate('team.goalCancel.keep', 'Keep goal')}
          </Button>
          <Button
            ref={confirmButton}
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setError(null)
              void onConfirm(goal).then(setError)
            }}
          >
            {spinning ? <Loader2 className="animate-spin" /> : <Ban />}
            {translate('team.goalLane.cancel', 'Cancel goal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
