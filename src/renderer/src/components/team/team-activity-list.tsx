import React, { useCallback, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { TeamActivityFeedRow } from './team-activity-feed-row'
import {
  countUnseenTeamFeedRows,
  teamActivityMemberIds,
  type TeamFeedRow
} from './team-feed-threads'
import { teamFloorHighlight, useHighlightedTeamMemberIds } from './team-floor-highlight'
import type { TeamMember } from './team-snapshot-types'
import { useTeamFeedAutoscroll } from './use-team-feed-autoscroll'

/**
 * The page's one list of what happened between people on the team, oldest first and pinned to the
 * newest row. The floor's feed, the Inbox columns, the Orchestrator's routing log and a member's
 * mail are all this list over different rows.
 */
export function TeamActivityList({
  rows,
  members,
  emptyLabel,
  fullBodies,
  bodiesOpen = false,
  pointsAtFloor = false,
  onOpenThread
}: {
  rows: readonly TeamFeedRow[]
  members: readonly TeamMember[]
  /** Shown instead of the list while it has no rows; null shows nothing. */
  emptyLabel: string | null
  /** Whole message texts by message id. An event only carries the first 280 characters. */
  fullBodies?: ReadonlyMap<string, string>
  bodiesOpen?: boolean
  /** Clicking a row marks the people it names on the floor. */
  pointsAtFloor?: boolean
  onOpenThread?: (threadId: string) => void
}): React.JSX.Element {
  const scroll = useTeamFeedAutoscroll(rows.at(-1)?.entry.event.sequence ?? 0, rows.length)
  const highlighted = useHighlightedTeamMemberIds()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const select = useCallback((row: TeamFeedRow) => {
    setSelectedId(row.entry.event.id)
    teamFloorHighlight.pulse(teamActivityMemberIds(row.entry.event))
  }, [])
  const unseen = scroll.detached ? countUnseenTeamFeedRows(rows, scroll.seenThroughSequence) : 0
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroll.scrollRef}
        onScroll={scroll.onScroll}
        className="scrollbar-sleek min-h-0 flex-1 space-y-0.5 overflow-y-auto"
      >
        {rows.length === 0 && emptyLabel ? (
          <p className="px-2 text-[13px] text-muted-foreground">{emptyLabel}</p>
        ) : null}
        {rows.map((row) => (
          <TeamActivityFeedRow
            key={row.entry.event.id}
            row={row}
            members={members}
            // The mark on the row lasts as long as the one on the floor.
            current={selectedId === row.entry.event.id && highlighted.size > 0}
            body={fullBodies?.get(row.entry.event.message_id ?? '') || row.entry.event.body_preview}
            bodyOpen={bodiesOpen}
            onSelect={pointsAtFloor ? select : undefined}
            onOpenThread={onOpenThread}
          />
        ))}
      </div>
      {unseen > 0 ? (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <Button size="xs" variant="secondary" onClick={scroll.jumpToLatest}>
            <ArrowDown />
            {translate('team.feed.newCount', '{{count}} new', { count: unseen })}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
