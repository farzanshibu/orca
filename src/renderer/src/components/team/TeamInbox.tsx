import React, { useMemo, useState } from 'react'
import { Webhook } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { cn } from '@/lib/utils'
import { TeamActivityList } from './team-activity-list'
import type { TeamAttention } from './team-attention'
import { buildTeamFeedRows, teamMailRows } from './team-feed-threads'
import { WaitingItem } from './TeamInboxCards'
import type { TeamSnapshot } from './team-snapshot-types'
import type { TeamActivity } from './use-team-activity'
import type { TeamAct } from './use-team-page-state'

type InboxView = 'askMe' | 'all' | 'webhooks'

export function TeamInbox({
  target,
  snapshot,
  attention,
  activity,
  pendingActions,
  act,
  onOpenRoom
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  /** The list the section count and the floor markers read too. */
  attention: TeamAttention
  activity: TeamActivity
  /** Each row's action runs under its item id, so only that row disables. */
  pendingActions: readonly string[]
  act: TeamAct
  onOpenRoom: (memberId: string) => void
}): React.JSX.Element {
  const [view, setView] = useState<InboxView>('askMe')
  const rows = useMemo(() => buildTeamFeedRows(activity.entries), [activity.entries])
  const all = teamMailRows(rows, { kind: 'all' })
  const external = teamMailRows(rows, { kind: 'from-outside' })
  const tabs: { key: InboxView; label: string; count?: number }[] = [
    { key: 'askMe', label: translate('team.inbox.askMe', 'Ask me'), count: attention.count },
    { key: 'all', label: translate('team.inbox.all', 'All routed messages') },
    { key: 'webhooks', label: translate('team.inbox.webhooks', 'Webhooks') }
  ]
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        role="tablist"
        aria-label={translate('team.inbox.views', 'Inbox views')}
        className="flex shrink-0 flex-wrap gap-1 border-b-2 border-bureau-ink pb-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            onClick={() => setView(tab.key)}
            className={cn('bureau-tab', view === tab.key && 'bureau-tab-active')}
          >
            {tab.label}
            {tab.count ? <span className="bureau-nav-count">{tab.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {view === 'askMe' ? (
          attention.items.length > 0 ? (
            attention.items.map((item) => (
              <WaitingItem
                key={item.id}
                item={item}
                target={target}
                snapshot={snapshot}
                busy={pendingActions.includes(item.id)}
                act={act}
                onOpenRoom={onOpenRoom}
              />
            ))
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {translate('team.inbox.nothingWaiting', 'Nothing is waiting on you.')}
            </p>
          )
        ) : null}
        {view === 'all' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <TeamActivityList
              rows={all}
              members={snapshot.members}
              emptyLabel={
                activity.loaded ? translate('team.inbox.noRouted', 'No routed messages yet.') : null
              }
            />
          </div>
        ) : null}
        {view === 'webhooks' ? (
          <>
            <section className="bureau-card flex items-start gap-2 p-3">
              <Webhook className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="text-[13px] font-semibold">
                  {translate('team.inbox.webhookTitle', 'Outside triggers land here')}
                </div>
                <p className="text-[12px] text-bureau-ink-soft">
                  {translate(
                    'team.inbox.webhookHint',
                    'Webhooks, automations and Orca itself post into the team. Turn endpoints on in Automations.'
                  )}
                </p>
              </div>
            </section>
            <TeamActivityList
              rows={external}
              members={snapshot.members}
              emptyLabel={
                activity.loaded
                  ? translate(
                      'team.inbox.noExternal',
                      'Nothing from automations, webhooks, or Orca yet.'
                    )
                  : null
              }
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
