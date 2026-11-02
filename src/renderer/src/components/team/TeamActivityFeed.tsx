import React, { useCallback, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { TeamActivityList } from './team-activity-list'
import {
  buildTeamFeedRows,
  filterTeamFeedRows,
  isTeamFeedFamilyFilter,
  UNFILTERED_TEAM_FEED,
  type TeamFeedFamilyFilter,
  type TeamFeedFilter
} from './team-feed-threads'
import type { TeamMember } from './team-snapshot-types'
import type { TeamActivity } from './use-team-activity'

const EVERYONE = 'everyone'

function familyLabel(family: TeamFeedFamilyFilter): string {
  switch (family) {
    case 'all':
      return translate('team.feed.family.all', 'All')
    case 'mail':
      return translate('team.feed.family.mail', 'Mail')
    case 'work':
      return translate('team.feed.family.work', 'Work')
    case 'people':
      return translate('team.feed.family.people', 'People')
  }
}

const FAMILY_FILTERS: readonly TeamFeedFamilyFilter[] = ['all', 'mail', 'work', 'people']

function FeedFilters({
  filter,
  members,
  onChange
}: {
  filter: TeamFeedFilter
  members: readonly TeamMember[]
  onChange: (filter: TeamFeedFilter) => void
}): React.JSX.Element {
  if (filter.threadId !== null) {
    return (
      <div className="flex items-center gap-2 px-3 pb-2 text-[12px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {translate('team.feed.threadOnly', 'Showing one thread')}
        </span>
        <Button size="xs" variant="ghost" onClick={() => onChange({ ...filter, threadId: null })}>
          <X />
          {translate('team.feed.showAll', 'Show everything')}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={filter.family}
        aria-label={translate('team.feed.familyFilter', 'Kind of activity')}
        onValueChange={(value) => {
          // Radix sends '' when the pressed item is pressed again; one filter is always on.
          if (isTeamFeedFamilyFilter(value)) {
            onChange({ ...filter, family: value })
          }
        }}
      >
        {FAMILY_FILTERS.map((family) => (
          <ToggleGroupItem key={family} value={family}>
            {familyLabel(family)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select
        value={filter.memberId ?? EVERYONE}
        onValueChange={(value) =>
          onChange({ ...filter, memberId: value === EVERYONE ? null : value })
        }
      >
        <SelectTrigger
          size="sm"
          className="min-w-0 flex-1"
          aria-label={translate('team.feed.memberFilter', 'Member')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EVERYONE}>{translate('team.feed.everyone', 'Everyone')}</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** What the list says when it has nothing to show, or null while the first page is still out. */
function emptyFeedLabel(activity: TeamActivity, filtered: boolean): string | null {
  if (!activity.loaded) {
    return null
  }
  return filtered
    ? translate('team.feed.nothingMatches', 'Nothing matches these filters.')
    : translate('team.feed.empty', 'Nothing has happened on this team yet.')
}

/**
 * The live feed, as a Command Center section. The floor is always on screen beside it, so a click
 * marks the people involved there.
 */
export function TeamActivityFeed({
  activity,
  members
}: {
  activity: TeamActivity
  members: readonly TeamMember[]
}): React.JSX.Element {
  const [filter, setFilter] = useState<TeamFeedFilter>(UNFILTERED_TEAM_FEED)
  // A member who left the team cannot stay selected: the Select would show a blank value.
  const memberId = members.some((member) => member.id === filter.memberId) ? filter.memberId : null
  const { family, threadId } = filter
  const rows = useMemo(
    () => filterTeamFeedRows(buildTeamFeedRows(activity.entries), { family, memberId, threadId }),
    [activity.entries, family, memberId, threadId]
  )
  const filtered = family !== 'all' || memberId !== null || threadId !== null
  const openThread = useCallback(
    (id: string) => setFilter((current) => ({ ...current, threadId: id })),
    []
  )
  return (
    <section
      aria-label={translate('team.feed.title', 'Activity')}
      className="flex min-h-0 w-full flex-1 flex-col"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          {translate('team.feed.title', 'Activity')}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
          {activity.error
            ? translate('team.page.reconnecting', 'Reconnecting…')
            : activity.source === 'legacy'
              ? translate('team.feed.legacy', 'Messages only on this host')
              : null}
        </span>
      </div>
      <FeedFilters filter={{ family, memberId, threadId }} members={members} onChange={setFilter} />
      <div className="flex min-h-0 flex-1 flex-col px-1 pb-1">
        <TeamActivityList
          rows={rows}
          members={members}
          emptyLabel={emptyFeedLabel(activity, filtered)}
          pointsAtFloor
          onOpenThread={openThread}
        />
      </div>
    </section>
  )
}
