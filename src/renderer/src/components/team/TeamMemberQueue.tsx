import React from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { removeTeamQueueItem, reorderTeamQueue } from './team-runtime-client'
import type { TeamMember } from './team-snapshot-types'
import type { TeamAct } from './use-team-page-state'

function moved(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const next = [...ids]
  const [item] = next.splice(index, 1)
  next.splice(index + delta, 0, item)
  return next
}

export function TeamMemberQueue({
  target,
  teamId,
  member,
  busy,
  act
}: {
  target: RuntimeClientTarget
  teamId: string
  member: TeamMember
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const queueIds = member.queue.map((item) => item.id)
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {translate('team.room.queue', 'Queue · sent in order when the agent is idle')}
      </div>
      {member.queue.length ? (
        member.queue.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate text-[13px]">{item.text}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={busy || index === 0}
              aria-label={translate('team.room.moveUp', 'Move up')}
              onClick={() =>
                void act(() =>
                  reorderTeamQueue(target, {
                    team: teamId,
                    member: member.id,
                    order: moved(queueIds, index, -1)
                  })
                )
              }
            >
              <ArrowUp />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={busy || index === member.queue.length - 1}
              aria-label={translate('team.room.moveDown', 'Move down')}
              onClick={() =>
                void act(() =>
                  reorderTeamQueue(target, {
                    team: teamId,
                    member: member.id,
                    order: moved(queueIds, index, 1)
                  })
                )
              }
            >
              <ArrowDown />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={busy}
              aria-label={translate('team.room.removeQueued', 'Remove from queue')}
              onClick={() =>
                void act(() => removeTeamQueueItem(target, { team: teamId, id: item.id }))
              }
            >
              <X />
            </Button>
          </div>
        ))
      ) : (
        <p className="px-2 text-[12px] text-muted-foreground">
          {translate('team.room.queueEmpty', 'Nothing queued.')}
        </p>
      )}
    </div>
  )
}
