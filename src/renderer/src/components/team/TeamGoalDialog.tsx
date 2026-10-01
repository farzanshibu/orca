import React, { useRef, useState } from 'react'
import { Loader2, Target } from 'lucide-react'
import { toast } from 'sonner'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { hasRuntimeRpcErrorCode } from '@/runtime/runtime-rpc-client'
import { teamStatusLabel } from './team-enum-labels'
import {
  canSubmitTeamGoal,
  splitTeamGoalText,
  teamGoalBlocker,
  teamGoalDelivery,
  teamGoalSubmitShortcutKeys,
  type TeamFanoutSupport,
  type TeamGoalBlocker,
  type TeamGoalDelivery
} from './team-goal-draft'
import { runTeamActionInline, teamActionErrorMessage } from './team-inline-action'
import { createTeamGoal } from './team-runtime-client'
import type { TeamSnapshot } from './team-snapshot-types'
import { useDelayedSpinner } from './use-delayed-spinner'
import type { TeamAct } from './use-team-page-state'

export const TEAM_GOAL_CREATE_ACTION = 'goal-create'

export function teamGoalBlockerMessage(blocker: TeamGoalBlocker, teamStatus: string): string {
  switch (blocker) {
    case 'host_unsupported':
      return translate(
        'team.goal.hostUnsupported',
        'The Orca on this host is too old to plan goals. Update it to give the team a goal.'
      )
    case 'team_closing':
      return translate(
        'team.goal.teamClosing',
        'Closing time is under way. Call it off on the Orchestrator tab to give the team a goal.'
      )
    case 'team_paused':
      return translate(
        'team.goal.teamPaused',
        'This team is paused. Resume it on the Orchestrator tab to give it a goal.'
      )
    case 'team_inactive':
      return translate(
        'team.goal.teamInactive',
        'This team takes no goals while it is: {{status}}',
        {
          status: teamStatusLabel(teamStatus)
        }
      )
    case 'no_manager':
      return translate(
        'team.goal.noManager',
        'This team has no manager to plan a goal. Add one first.'
      )
  }
}

function deliveryNote(delivery: TeamGoalDelivery, manager: string): string | null {
  switch (delivery) {
    case 'when_idle':
      return null
    case 'manager_paused':
      return translate(
        'team.goal.managerPaused',
        '{{manager}} is paused, so the goal waits in its queue until you resume it.',
        { manager }
      )
    case 'manager_stopped':
      return translate(
        'team.goal.managerStopped',
        '{{manager}} is not running, so the goal waits in its queue until you start it.',
        { manager }
      )
    case 'behind_queue':
      return translate(
        'team.goal.behindQueue',
        '{{manager}} has other queued messages. The goal is sent after them.',
        { manager }
      )
    case 'manager_silent':
      return translate(
        'team.goal.managerSilent',
        'No recent update from {{manager}}. The goal waits in its queue until its agent is seen idle.',
        { manager }
      )
  }
}

export function TeamGoalDialog({
  open,
  target,
  snapshot,
  support,
  busy,
  act,
  onOpenChange
}: {
  open: boolean
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  support: TeamFanoutSupport
  /** Whether a goal is being sent, from the page's pending actions. */
  busy: boolean
  act: TeamAct
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  // The text as last typed, readable after an await.
  const draft = useRef('')
  const [error, setError] = useState<string | null>(null)
  // A host that answered "no such method" after an unanswered or stale capability probe.
  const [hostRefused, setHostRefused] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  // Guards the gap before `busy` arrives from the page, so a held chord sends one goal.
  const sending = useRef(false)
  const spinning = useDelayedSpinner(busy)
  const manager = snapshot.members.find((member) => member.is_manager)
  const blocker = teamGoalBlocker({
    support: hostRefused ? 'unsupported' : support,
    team: snapshot.team,
    members: snapshot.members
  })
  const canSubmit = canSubmitTeamGoal({ text, busy, blocker })
  const note =
    manager && !blocker ? deliveryNote(teamGoalDelivery(manager), manager.display_name) : null

  const submit = async (): Promise<void> => {
    if (!canSubmit || sending.current) {
      return
    }
    sending.current = true
    setError(null)
    const sent = text
    const outcome = await runTeamActionInline(act, TEAM_GOAL_CREATE_ACTION, () =>
      createTeamGoal(target, { team: snapshot.team.id, ...splitTeamGoalText(sent) })
    )
    sending.current = false
    if (!outcome.ok) {
      if (hasRuntimeRpcErrorCode(outcome.error, 'method_not_found')) {
        setHostRefused(true)
      } else {
        setError(teamActionErrorMessage(outcome.error))
      }
      // Dismissed while the request was out: reopen, so the failure is never silent.
      onOpenChange(true)
      return
    }
    const goal = outcome.value.ref ?? outcome.value.title
    // Says the prompt was queued only when the host says it was.
    if (outcome.value.queued) {
      toast.success(
        translate('team.goal.queued', 'Goal {{goal}} is queued for the manager.', { goal })
      )
    } else {
      toast.message(
        translate(
          'team.goal.filedOnly',
          'Goal {{goal}} was filed. The manager was not asked to plan it.',
          { goal }
        )
      )
    }
    // Reopened and retyped while the request was out: that is a new draft, left as it is.
    if (draft.current === sent) {
      draft.current = ''
      setText('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          textarea.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{translate('team.goal.title', 'New goal')}</DialogTitle>
          <DialogDescription>
            {manager
              ? translate(
                  'team.goal.description',
                  'Orca queues this for {{manager}} and asks it to split the goal into tasks and assign them.',
                  { manager: manager.display_name }
                )
              : translate(
                  'team.goal.descriptionNoManager',
                  'Orca asks the manager to split a goal into tasks and assign them.'
                )}
          </DialogDescription>
        </DialogHeader>
        {blocker ? (
          <p
            role="status"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[13px]"
          >
            {teamGoalBlockerMessage(blocker, snapshot.team.status)}
          </p>
        ) : null}
        <Textarea
          ref={textarea}
          value={text}
          aria-label={translate('team.goal.fieldLabel', 'Goal')}
          placeholder={translate('team.goal.placeholder', 'What should the team get done?')}
          className="max-h-[50vh] min-h-32"
          onChange={(event) => {
            draft.current = event.target.value
            setText(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (isScreenSubmitShortcut(event)) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {note ? <p className="text-[12px] text-muted-foreground">{note}</p> : null}
        {error ? (
          <p role="alert" className="text-[12px] break-words text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter className="sm:items-center">
          <ShortcutKeyCombo keys={teamGoalSubmitShortcutKeys()} className="sm:mr-auto" />
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {spinning ? <Loader2 className="animate-spin" /> : <Target />}
            {translate('team.goal.submit', 'Send to manager')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
