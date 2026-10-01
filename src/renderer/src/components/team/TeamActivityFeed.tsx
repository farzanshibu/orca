import React, { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
 * The live feed beside the floor. A column on a wide page; under the floor, and collapsible, on a
 * narrower one. The switch is a container query on the page, so it follows the page's own width.
 */
export function TeamActivityFeed({
  activity,
  members
}: {
  activity: TeamActivity
  members: readonly TeamMember[]
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
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
      className="flex min-h-0 shrink-0 flex-col rounded-xl border border-border bg-card @7xl/team-page:w-[340px]"
    >
      <Collapsible open={open} onOpenChange={setOpen} className="flex min-h-0 flex-1 flex-col">
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
          <CollapsibleTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              className="@7xl/team-page:hidden"
              aria-label={
                open
                  ? translate('team.feed.collapse', 'Hide activity')
                  : translate('team.feed.expand', 'Show activity')
              }
            >
              {open ? <ChevronDown /> : <ChevronUp />}
            </Button>
          </CollapsibleTrigger>
        </div>
        {/* Kept mounted so the list holds its scroll position; the column ignores the closed state. */}
        <CollapsibleContent
          forceMount
          className="flex h-56 min-h-0 flex-col data-[state=closed]:hidden @7xl/team-page:h-auto @7xl/team-page:flex-1 @7xl/team-page:data-[state=closed]:flex"
        >
          <FeedFilters
            filter={{ family, memberId, threadId }}
            members={members}
            onChange={setFilter}
          />
          <div className="flex min-h-0 flex-1 flex-col px-1 pb-1">
            <TeamActivityList
              rows={rows}
              members={members}
              emptyLabel={emptyFeedLabel(activity, filtered)}
              pointsAtFloor
              onOpenThread={openThread}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}

/** The floor with its feed: side by side when the page is at least 1280px wide, stacked below that. */
export function TeamFloorWithFeed({
  activity,
  members,
  children
}: {
  activity: TeamActivity
  members: readonly TeamMember[]
  /** The floor. */
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 @7xl/team-page:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
      <TeamActivityFeed activity={activity} members={members} />
    </div>
  )
}
