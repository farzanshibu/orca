import React, { useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronUp, MessagesSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { NativeChatMessageTimestamp } from '../native-chat/NativeChatMessageTimestamp'
import { TeamFeedPartyAvatar } from './team-feed-party-avatar'
import {
  parseTeamEventTime,
  teamFeedBadgeVariant,
  teamFeedRecipientLine,
  teamFeedSenderName,
  teamFeedStatusLabel,
  teamFeedTypeLabel
} from './team-feed-row-labels'
import type { TeamFeedRow } from './team-feed-threads'
import type { TeamMember } from './team-snapshot-types'

// More recipients than this are counted in the name line instead of drawn.
const RECIPIENT_AVATARS = 3

function RowSummary({
  row,
  members
}: {
  row: TeamFeedRow
  members: readonly TeamMember[]
}): React.JSX.Element {
  const { event } = row.entry
  const sender = members.find((member) => member.id === event.from.member_id)
  const recipients = event.to.member_ids.slice(0, RECIPIENT_AVATARS)
  const detail = [event.task_ref, teamFeedStatusLabel(event)].filter(Boolean).join(' · ')
  return (
    <>
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <TeamFeedPartyAvatar
          party={event.from.party}
          slug={sender?.slug}
          manager={Boolean(sender?.is_manager)}
        />
        <span className="max-w-[35%] shrink-0 truncate">{teamFeedSenderName(event, members)}</span>
        <ArrowRight aria-hidden="true" className="size-3 shrink-0" />
        <span className="sr-only">{translate('team.feed.to', 'to')}</span>
        {recipients.length === 0 ? (
          <TeamFeedPartyAvatar party={event.to.party} slug={undefined} />
        ) : (
          recipients.map((id) => {
            const member = members.find((candidate) => candidate.id === id)
            return (
              <TeamFeedPartyAvatar
                key={id}
                party="member"
                slug={member?.slug}
                manager={Boolean(member?.is_manager)}
              />
            )
          })
        )}
        <span className="min-w-0 flex-1 truncate">{teamFeedRecipientLine(event, members)}</span>
        <NativeChatMessageTimestamp timestamp={parseTeamEventTime(event.created_at)} />
      </span>
      <span className="mt-1 flex items-start gap-1.5">
        <Badge variant={teamFeedBadgeVariant(event)}>{teamFeedTypeLabel(event)}</Badge>
        <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-5 break-words">
          {detail ? (
            <span className="text-muted-foreground">{event.subject ? `${detail} · ` : detail}</span>
          ) : null}
          {event.subject}
        </span>
        {row.read ? (
          <Check
            aria-label={translate('team.feed.read', 'Read')}
            className="mt-1 size-3 shrink-0 text-muted-foreground"
          />
        ) : null}
      </span>
    </>
  )
}

type TeamActivityFeedRowProps = {
  row: TeamFeedRow
  members: readonly TeamMember[]
  /** This row's people are the ones marked on the floor right now. */
  current: boolean
  /** The text behind the toggle: the event's preview, or the whole message where the caller has it. */
  body: string | null
  /** Whether the body starts open: a member's mail reads as a conversation, the feed as headlines. */
  bodyOpen: boolean
  /** Makes the row a control; without it the row is only read. */
  onSelect?: (row: TeamFeedRow) => void
  /** Offers the row's thread when the feed holds more of it. */
  onOpenThread?: (threadId: string) => void
}

function sameRow(before: TeamActivityFeedRowProps, after: TeamActivityFeedRowProps): boolean {
  return (
    before.row.entry === after.row.entry &&
    before.row.threadSize === after.row.threadSize &&
    before.row.read === after.row.read &&
    before.members === after.members &&
    before.current === after.current &&
    before.body === after.body &&
    before.bodyOpen === after.bodyOpen &&
    before.onSelect === after.onSelect &&
    before.onOpenThread === after.onOpenThread
  )
}

/** One event: when, who to whom, what kind, its subject, and its body behind a toggle. */
export const TeamActivityFeedRow = React.memo(function TeamActivityFeedRow({
  row,
  members,
  current,
  body,
  bodyOpen,
  onSelect,
  onOpenThread
}: TeamActivityFeedRowProps): React.JSX.Element {
  const { event } = row.entry
  const [open, setOpen] = useState(bodyOpen)
  const threadId = onOpenThread && row.threadSize > 1 ? event.thread_id : null
  const summary = <RowSummary row={row} members={members} />
  return (
    <div
      data-current={current ? 'true' : undefined}
      className="rounded-md hover:bg-accent data-[current=true]:bg-accent"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-0.5 pr-1">
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {summary}
            </button>
          ) : (
            <div className="min-w-0 flex-1 px-2 py-1.5">{summary}</div>
          )}
          {threadId && onOpenThread ? (
            <Button
              size="xs"
              variant="ghost"
              className="mt-1"
              aria-label={translate(
                'team.feed.openThread',
                'Show the {{count}} messages of this thread',
                { count: row.threadSize }
              )}
              onClick={() => onOpenThread(threadId)}
            >
              <MessagesSquare />
              {row.threadSize}
            </Button>
          ) : null}
          {body ? (
            <CollapsibleTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                className="mt-1"
                aria-label={
                  open
                    ? translate('team.feed.hideBody', 'Hide the message')
                    : translate('team.feed.showBody', 'Show the message')
                }
              >
                {open ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </CollapsibleTrigger>
          ) : null}
        </div>
        {body ? (
          <CollapsibleContent>
            <p className="px-2 pb-2 text-[12px] break-words whitespace-pre-wrap text-muted-foreground">
              {body}
            </p>
          </CollapsibleContent>
        ) : null}
      </Collapsible>
    </div>
  )
}, sameRow)
