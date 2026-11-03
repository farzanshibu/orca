import React, { useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { FloorCharacter } from './office-floor-character'
import { Desk, type PlacedMember } from './office-floor-desk'
import {
  CoffeeTable,
  Couch,
  FrontDoor,
  KitchenCounter,
  KitchenFloor,
  Room,
  Stools,
  Television,
  Whiteboard
} from './office-floor-furniture'
import { BEDROOM_COUNT, ROAM_INTERVAL_MS, roamTargets } from './office-floor-roaming'
import { floorActivity, summarizeFloor } from './office-floor-state'
import { parseSqliteUtc } from './TeamTaskBoard'
import type { TeamLogMessage, TeamMember, TeamTask } from './team-snapshot-types'
import { useFloorAnchors } from './use-floor-anchors'
import { useTeamClock } from './use-team-clock'

// Mail newer than this marks the sender and recipient desks, so the floor shows traffic, not history.
const MAIL_WINDOW_MS = 10_000
const BEDROOM_SLOT_PX = 38

function FloorSummaryLine({
  placed
}: {
  placed: readonly PlacedMember[]
}): React.JSX.Element | null {
  const summary = summarizeFloor(placed.map((entry) => entry.activity))
  const parts = [
    summary.working
      ? translate('team.floor.summary.working', '{{count}} working', { count: summary.working })
      : null,
    summary.waiting
      ? translate('team.floor.summary.waiting', '{{count}} need you', { count: summary.waiting })
      : null,
    summary.idle
      ? translate('team.floor.summary.idle', '{{count}} on a break', { count: summary.idle })
      : null,
    summary.off
      ? translate('team.floor.summary.off', '{{count}} offline', { count: summary.off })
      : null
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) {
    return null
  }
  return <span className="text-[12px] text-muted-foreground">{parts.join(' · ')}</span>
}

export function TeamOfficeFloor({
  members,
  tasks,
  log,
  onOpenRoom,
  onAddMember
}: {
  members: readonly TeamMember[]
  tasks: readonly TeamTask[]
  log: readonly TeamLogMessage[]
  onOpenRoom: (memberId: string) => void
  onAddMember: () => void
}): React.JSX.Element {
  const now = useTeamClock(2_000)
  const toolByPane = useAppStore(
    useShallow((state) =>
      Object.fromEntries(
        members.flatMap((member) =>
          member.pane_key
            ? [[member.pane_key, state.agentStatusByPaneKey[member.pane_key]?.toolName ?? '']]
            : []
        )
      )
    )
  )
  const mailHandles = useMemo(() => {
    const handles = new Set<string>()
    for (const message of log) {
      const sent = parseSqliteUtc(message.created_at)
      if (sent !== null && now - sent < MAIL_WINDOW_MS && message.type !== 'heartbeat') {
        handles.add(message.from_handle)
        handles.add(message.to_handle)
      }
    }
    return handles
  }, [log, now])
  const placed: PlacedMember[] = members.map((member) => ({
    member,
    activity: floorActivity(member.liveness, member.agent_status, Boolean(member.paused_at)),
    tool: member.pane_key ? (toolByPane[member.pane_key] ?? '') : '',
    task: tasks.find(
      (task) =>
        task.status === 'dispatched' &&
        task.assignee_handle !== null &&
        task.assignee_handle === member.live_handle
    ),
    hasMail: member.live_handle !== null && mailHandles.has(member.live_handle)
  }))
  const manager = placed.find((entry) => entry.member.is_manager)
  const staff = placed.filter((entry) => !entry.member.is_manager)
  const planRef = useRef<HTMLDivElement>(null)
  const anchors = useFloorAnchors(planRef, members.map((member) => member.id).join(','))
  const targets = roamTargets(
    placed.map(({ member, activity }) => ({ id: member.id, slug: member.slug, activity })),
    Math.floor(now / ROAM_INTERVAL_MS)
  )
  const restingCount = placed.filter((entry) => entry.activity === 'off').length

  return (
    <div className="scrollbar-sleek flex h-full w-full flex-col gap-3 overflow-y-auto">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {translate('team.floor.apartment', 'Apartment')}
        </span>
        <FloorSummaryLine placed={placed} />
      </div>
      <div ref={planRef} className="team-office-plan relative">
        <Room area="desks" label={translate('team.floor.desks', 'Desks by the window')}>
          <span
            className="absolute top-12 right-0 bottom-6 w-1 rounded-l-sm bg-foreground/25"
            aria-hidden="true"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {staff.map((entry) => (
              <Desk key={entry.member.id} entry={entry} onOpenRoom={onOpenRoom} />
            ))}
            <button
              type="button"
              onClick={onAddMember}
              className="flex min-h-[112px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-4 text-center text-[12px] text-muted-foreground transition-colors outline-none hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-4" />
              {staff.length === 0
                ? translate('team.floor.firstDesk', 'Add your first member')
                : translate('team.floor.openDesk', 'Open desk')}
            </button>
          </div>
        </Room>
        <Room area="board" label={translate('team.floor.board', 'Whiteboard wall')}>
          <span
            data-floor-anchor="board"
            className="pointer-events-none absolute top-[104px] left-1/2 h-0 w-8"
            aria-hidden="true"
          />
          <div className="flex gap-2">
            <Whiteboard variant={0} />
            <Whiteboard variant={1} />
          </div>
          {manager ? (
            <Desk entry={manager} onOpenRoom={onOpenRoom} />
          ) : (
            <div className="flex min-h-[112px] items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-muted-foreground">
              {translate('team.floor.noManager', 'No manager yet')}
            </div>
          )}
        </Room>
        <Room area="living" label={translate('team.floor.living', 'Living room')}>
          <div className="flex flex-1 flex-col justify-between gap-6 py-2">
            <Television />
            <CoffeeTable />
            <Couch />
          </div>
        </Room>
        <Room area="kitchen" floor="tiles" label={translate('team.floor.kitchen', 'Kitchen')}>
          <KitchenCounter />
          <KitchenFloor />
          <Stools />
        </Room>
        <Room area="entry" label={translate('team.floor.entry', 'Entry')}>
          <FrontDoor onAddMember={onAddMember} />
        </Room>
        <Room area="bedrooms" label={translate('team.floor.bedrooms', 'Bedrooms')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: BEDROOM_COUNT }, (_, room) => (
              <div
                key={room}
                data-floor-anchor={`bedroom-${room}`}
                className="flex min-h-[84px] items-start justify-end rounded-lg border border-border bg-muted/30 p-2"
              >
                <span
                  className="h-6 w-12 rounded-sm border border-border bg-card"
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
          {restingCount === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {translate('team.floor.bedroomEmpty', 'Nobody is resting.')}
            </span>
          ) : null}
        </Room>
        <div className="pointer-events-none absolute inset-0">
          {placed.map(({ member, activity }) => {
            const target = targets.get(member.id)
            const point = target ? anchors.get(target.anchor) : undefined
            if (!target || !point) {
              return null
            }
            const offset =
              target.slot === 0 ? 0 : (target.slot % 2 ? 1 : -1) * Math.ceil(target.slot / 2)
            return (
              <FloorCharacter
                key={member.id}
                id={member.id}
                slug={member.slug}
                name={member.display_name}
                activity={activity}
                seated={target.anchor.startsWith('desk-')}
                x={point.x + offset * BEDROOM_SLOT_PX}
                y={point.y - 4}
                onOpenRoom={onOpenRoom}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
