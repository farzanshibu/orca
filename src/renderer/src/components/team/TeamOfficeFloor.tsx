import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  COFFEE_STATION,
  FLOOR_HEIGHT,
  FLOOR_WIDTH,
  MANAGER_OFFICE,
  WATER_COOLER,
  deskFor,
  floorActivity,
  positionFor,
  spriteVariant,
  type FloorActivity,
  type FloorPoint
} from './office-floor-layout'
import { parseSqliteUtc } from './TeamTaskBoard'
import type { TeamLogMessage, TeamMember } from './team-snapshot-types'
import { useTeamClock } from './use-team-clock'

// Envelopes fly for mail newer than this, so the floor shows traffic, not history.
const ENVELOPE_WINDOW_MS = 10_000
const SHIRT_FILLS = [
  'fill-foreground',
  'fill-muted-foreground',
  'fill-primary',
  'fill-accent-foreground'
]

/** An 8x12 pixel person; the shirt shade tells members apart without new colors. */
function PixelPerson({
  variant,
  activity
}: {
  variant: number
  activity: FloorActivity
}): React.JSX.Element {
  const shirt = SHIRT_FILLS[variant % SHIRT_FILLS.length]
  return (
    <g shapeRendering="crispEdges" opacity={activity === 'off' ? 0.35 : 1}>
      <rect x={-6} y={-24} width={12} height={4} className="fill-foreground" />
      <rect
        x={-6}
        y={-20}
        width={12}
        height={8}
        className="fill-muted"
        stroke="currentColor"
        strokeOpacity={0.4}
      />
      <rect x={-8} y={-12} width={16} height={12} className={shirt} />
      <rect x={-6} y={0} width={4} height={8} className="fill-foreground" />
      <rect x={2} y={0} width={4} height={8} className="fill-foreground" />
      {activity === 'working' ? (
        <rect x={-10} y={-6} width={20} height={3} className="animate-pulse fill-foreground" />
      ) : null}
      {activity === 'waiting' ? (
        <rect x={8} y={-30} width={3} height={14} className="animate-bounce fill-foreground" />
      ) : null}
    </g>
  )
}

function Desk({ at, label }: { at: FloorPoint; label: string }): React.JSX.Element {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect x={-44} y={-18} width={88} height={30} rx={4} className="fill-card stroke-border" />
      <rect x={-14} y={-30} width={28} height={16} rx={2} className="fill-muted stroke-border" />
      <text y={28} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {label}
      </text>
    </g>
  )
}

function Station({ at, label }: { at: FloorPoint; label: string }): React.JSX.Element {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect x={-18} y={-26} width={36} height={40} rx={6} className="fill-muted stroke-border" />
      <text y={30} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {label}
      </text>
    </g>
  )
}

function Bubble({ at, text }: { at: FloorPoint; text: string }): React.JSX.Element {
  const width = Math.min(160, 12 + text.length * 6.2)
  return (
    <g transform={`translate(${at.x} ${at.y - 58})`}>
      <rect
        x={-width / 2}
        y={-14}
        width={width}
        height={20}
        rx={6}
        className="fill-popover stroke-border"
      />
      <text y={1} textAnchor="middle" className="fill-foreground text-[11px]">
        {text.length > 24 ? `${text.slice(0, 23)}…` : text}
      </text>
    </g>
  )
}

export function TeamOfficeFloor({
  members,
  log,
  onOpenRoom
}: {
  members: readonly TeamMember[]
  log: readonly TeamLogMessage[]
  onOpenRoom: (memberId: string) => void
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
  const placed = useMemo(() => {
    let deskIndex = 0
    return members.map((member, index) => {
      const desk = deskFor(member.is_manager ? 0 : deskIndex++, member.is_manager === 1)
      const activity = floorActivity(
        member.liveness,
        member.agent_status,
        Boolean(member.paused_at)
      )
      return { member, desk, activity, position: positionFor(desk, activity, index) }
    })
  }, [members])
  const deskByHandle = new Map(
    placed.flatMap((entry) =>
      entry.member.live_handle ? [[entry.member.live_handle, entry.desk]] : []
    )
  )
  const managerDesk = placed.find((entry) => entry.member.is_manager)?.desk ?? MANAGER_OFFICE
  const envelopes = log.filter((message) => {
    const sent = parseSqliteUtc(message.created_at)
    return sent !== null && now - sent < ENVELOPE_WINDOW_MS && message.type !== 'heartbeat'
  })

  return (
    <svg
      viewBox={`0 0 ${FLOOR_WIDTH} ${FLOOR_HEIGHT}`}
      className="h-full w-full rounded-xl border border-border bg-muted/30"
      role="img"
      aria-label={translate('team.floor.label', 'Office floor')}
    >
      <rect
        x={720}
        y={40}
        width={210}
        height={170}
        rx={8}
        fill="none"
        className="stroke-border"
        strokeDasharray="6 4"
      />
      <text x={825} y={32} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {translate('team.floor.office', "Manager's office")}
      </text>
      <Station at={WATER_COOLER} label={translate('team.floor.cooler', 'Water cooler')} />
      <Station at={COFFEE_STATION} label={translate('team.floor.coffee', 'Coffee')} />
      {placed.map(({ member, desk }) => (
        <Desk key={`desk-${member.id}`} at={desk} label={member.display_name} />
      ))}
      {envelopes.map((message) => {
        const from = deskByHandle.get(message.from_handle) ?? managerDesk
        const to = message.to_handle.startsWith('run:')
          ? managerDesk
          : (deskByHandle.get(message.to_handle) ?? managerDesk)
        return (
          <g key={message.id} shapeRendering="crispEdges">
            <rect x={-7} y={-5} width={14} height={10} className="fill-card stroke-foreground">
              <animateMotion
                dur="1.6s"
                repeatCount="3"
                path={`M${from.x},${from.y - 40} L${to.x},${to.y - 40}`}
              />
            </rect>
          </g>
        )
      })}
      {placed.map(({ member, activity, position }) => {
        const tool = member.pane_key ? toolByPane[member.pane_key] : ''
        return (
          <g
            key={member.id}
            role="button"
            tabIndex={0}
            aria-label={member.display_name}
            onClick={() => onOpenRoom(member.id)}
            onKeyDown={(event) => (event.key === 'Enter' ? onOpenRoom(member.id) : undefined)}
            className="cursor-pointer outline-none"
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
              transition: 'transform 1.2s ease-in-out'
            }}
          >
            <PixelPerson
              variant={spriteVariant(member.slug, SHIRT_FILLS.length)}
              activity={activity}
            />
            {activity === 'working' && tool ? <Bubble at={{ x: 0, y: 0 }} text={tool} /> : null}
            {activity === 'waiting' ? (
              <Bubble at={{ x: 0, y: 0 }} text={translate('team.floor.needsYou', 'needs you')} />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
