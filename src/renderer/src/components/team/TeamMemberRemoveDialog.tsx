import React from 'react'
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
import type { TeamMember } from './team-snapshot-types'

/** Removal stops the agent and archives the member, so it asks before doing either. */
export function TeamMemberRemoveDialog({
  member,
  busy,
  onCancel,
  onConfirm
}: {
  /** Null keeps the dialog closed. */
  member: TeamMember | null
  busy: boolean
  onCancel: () => void
  onConfirm: (member: TeamMember) => Promise<boolean>
}): React.JSX.Element {
  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{translate('team.member.removeTitle', 'Remove member')}</DialogTitle>
          <DialogDescription>
            {translate(
              'team.member.removeDescription',
              'This stops {{name}} and takes it off the team. Its worktree stays on disk.',
              { name: member?.display_name ?? '' }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {translate('team.member.removeCancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !member}
            onClick={() => member && void onConfirm(member)}
          >
            {translate('team.member.removeSubmit', 'Remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
