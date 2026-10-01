import React from 'react'
import { Bot, CircleDashed, Cog, User, UserMinus, Users, Webhook } from 'lucide-react'
import { Portrait, memberLook } from './office-floor-sprite'

const AVATAR_PX = 20

function PartyIcon({ party }: { party: string }): React.JSX.Element {
  switch (party) {
    case 'operator':
      return <User className="size-3" />
    case 'external':
      return <Webhook className="size-3" />
    case 'system':
      return <Cog className="size-3" />
    case 'agent':
      return <Bot className="size-3" />
    case 'team':
      return <Users className="size-3" />
    case 'member':
      return <UserMinus className="size-3" />
    default:
      return <CircleDashed className="size-3" />
  }
}

/**
 * One end of a feed row: a member's floor portrait, or an icon for whoever is not on the roster.
 * Takes the look's inputs, not the member, so a new snapshot does not redraw every portrait.
 */
export const TeamFeedPartyAvatar = React.memo(function TeamFeedPartyAvatar({
  party,
  slug,
  manager = false
}: {
  party: string
  /** The member's slug when this end is someone on the roster. */
  slug: string | undefined
  manager?: boolean
}): React.JSX.Element {
  if (slug !== undefined) {
    return <Portrait look={memberLook(slug, manager)} size={AVATAR_PX} />
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
    >
      <PartyIcon party={party} />
    </span>
  )
})
