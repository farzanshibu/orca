import React, { useId, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  FLOOR_WIDTH,
  MANAGER_OFFICE,
  MIN_DESKS,
  OFFICE_BOUNDS,
  breakStations,
  deskFor,
  floorActivity,
  floorHeight,
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
const NAME_MAX_CHARS = 18

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** An 8x12 pixel person drawn at 1.5x; origin is the feet. */
function PixelPerson({
  variant,
  activity
}: {
  variant: number
  activity: FloorActivity
}): React.JSX.Element {
  const shirt = SHIRT_FILLS[variant % SHIRT_FILLS.length]
  return (
    <g shapeRendering="crispEdges" opacity={activity === 'off' ? 0.4 : 1} transform="scale(1.5)">
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
    </g>
  )
}

function statusLabel(activity: FloorActivity, paused: boolean, tool: string): string {
  if (activity === 'working') {
    return tool
      ? translate('team.floor.workingTool', 'Working · {{tool}}', { tool: truncate(tool, 14) })
      : translate('team.floor.working', 'Working')
  }
  if (activity === 'waiting') {
    return translate('team.floor.needsYouStatus', 'Needs you')
  }
  if (activity === 'idle') {
    return translate('team.floor.onBreak', 'On a break')
  }
  return paused
    ? translate('team.floor.paused', 'Paused')
    : translate('team.floor.offline', 'Offline')
}

/** Drawn over the sprites so a seated member's legs sit under the desk. */
function Desk({
  at,
  name,
  status,
  activity
}: {
  at: FloorPoint
  name: string | null
  status: string
  activity: FloorActivity | null
}): React.JSX.Element {
  const vacant = name === null
  return (
    <g transform={`translate(${at.x} ${at.y})`} pointerEvents="none">
      <rect
        x={-50}
        y={-18}
        width={100}
        height={34}
        rx={4}
        className="fill-card stroke-border"
        fillOpacity={vacant ? 0 : 1}
        strokeDasharray={vacant ? '5 4' : undefined}
      />
      {vacant ? null : (
        <>
          <rect
            x={-40}
            y={-12}
            width={26}
            height={16}
            rx={2}
            className="fill-muted stroke-border"
          />
          {activity === 'working' ? (
            <rect
              x={-37}
              y={-9}
              width={20}
              height={10}
              rx={1}
              className="animate-pulse fill-primary"
              opacity={0.5}
            />
          ) : null}
          <rect x={14} y={-8} width={10} height={10} rx={2} className="fill-muted" />
        </>
      )}
      <text
        y={36}
        textAnchor="middle"
        className={
          vacant ? 'fill-muted-foreground text-[12px]' : 'fill-foreground text-[12px] font-medium'
        }
      >
        {vacant ? translate('team.floor.openDesk', 'Open desk') : truncate(name, NAME_MAX_CHARS)}
      </text>
      {vacant ? null : (
        <text
          y={52}
          textAnchor="middle"
          className={
            activity === 'waiting'
              ? 'fill-foreground text-[11px] font-medium'
              : 'fill-muted-foreground text-[11px]'
          }
        >
          {status}
        </text>
      )}
    </g>
  )
}

function WaterCooler({ at }: { at: FloorPoint }): React.JSX.Element {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect x={-12} y={-44} width={24} height={26} rx={8} className="fill-primary" opacity={0.3} />
      <rect x={-15} y={-18} width={30} height={34} rx={3} className="fill-muted stroke-border" />
      <rect x={-4} y={-8} width={8} height={4} className="fill-muted-foreground" />
      <text y={-56} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {translate('team.floor.cooler', 'Water cooler')}
      </text>
    </g>
  )
}

function CoffeeStation({ at }: { at: FloorPoint }): React.JSX.Element {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect x={-22} y={-4} width={44} height={20} rx={3} className="fill-card stroke-border" />
      <rect x={-16} y={-36} width={20} height={32} rx={3} className="fill-muted stroke-border" />
      <rect x={-12} y={-30} width={12} height={6} className="fill-muted-foreground" />
      <rect x={8} y={-14} width={9} height={10} rx={1} className="fill-muted-foreground" />
      <text y={-56} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {translate('team.floor.coffee', 'Coffee')}
      </text>
    </g>
  )
}

function Bubble({ at, text }: { at: FloorPoint; text: string }): React.JSX.Element {
  const label = truncate(text, 24)
  const width = Math.min(170, 16 + label.length * 6.4)
  return (
    <g transform={`translate(${at.x} ${at.y - 50})`}>
      <rect
        x={-width / 2}
        y={-15}
        width={width}
        height={22}
        rx={6}
        className="fill-popover stroke-border"
      />
      <path d="M-5,7 L0,13 L5,7 Z" className="fill-popover" />
      <text y={1} textAnchor="middle" className="fill-foreground text-[11px]">
        {label}
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
  const gridId = useId()
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
  const staffCount = members.filter((member) => !member.is_manager).length
  const height = floorHeight(staffCount)
  const stations = useMemo(() => breakStations(height), [height])
  const placed = useMemo(() => {
    let deskIndex = 0
    let idleIndex = 0
    return members.map((member) => {
      const desk = deskFor(member.is_manager ? 0 : deskIndex++, member.is_manager === 1)
      const activity = floorActivity(
        member.liveness,
        member.agent_status,
        Boolean(member.paused_at)
      )
      const slot = activity === 'idle' ? idleIndex++ : 0
      return { member, desk, activity, position: positionFor(desk, activity, slot, stations) }
    })
  }, [members, stations])
  const vacantDesks = Array.from({ length: Math.max(0, MIN_DESKS - staffCount) }, (_, index) =>
    deskFor(staffCount + index, false)
  )
  const hasManager = placed.some((entry) => entry.member.is_manager)
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
      viewBox={`0 0 ${FLOOR_WIDTH} ${height}`}
      className="h-full w-full rounded-xl border border-border bg-muted/30"
      role="img"
      aria-label={translate('team.floor.label', 'Office floor')}
    >
      <defs>
        <pattern id={gridId} width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" className="stroke-border" strokeOpacity={0.35} />
        </pattern>
      </defs>
      <rect width={FLOOR_WIDTH} height={height} fill={`url(#${gridId})`} />
      <rect
        x={OFFICE_BOUNDS.x}
        y={OFFICE_BOUNDS.y}
        width={OFFICE_BOUNDS.width}
        height={OFFICE_BOUNDS.height}
        rx={8}
        className="fill-card stroke-border"
        fillOpacity={0.4}
        strokeDasharray="6 4"
      />
      <text
        x={OFFICE_BOUNDS.x + OFFICE_BOUNDS.width / 2}
        y={OFFICE_BOUNDS.y - 10}
        textAnchor="middle"
        className="fill-muted-foreground text-[11px]"
      >
        {translate('team.floor.office', "Manager's office")}
      </text>
      <WaterCooler at={stations.cooler} />
      <CoffeeStation at={stations.coffee} />
      {staffCount === 0 ? (
        <text
          x={deskFor(0, false).x + 255}
          y={deskFor(0, false).y + 100}
          textAnchor="middle"
          className="fill-muted-foreground text-[12px]"
        >
          {translate('team.floor.emptyHint', 'Add a member to fill a desk.')}
        </text>
      ) : null}
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
                path={`M${from.x},${from.y - 70} L${to.x},${to.y - 70}`}
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
            {activity === 'working' && tool ? <Bubble at={{ x: 0, y: -8 }} text={tool} /> : null}
            {activity === 'waiting' ? (
              <Bubble at={{ x: 0, y: -8 }} text={translate('team.floor.needsYou', 'needs you')} />
            ) : null}
          </g>
        )
      })}
      {hasManager ? null : <Desk at={MANAGER_OFFICE} name={null} status="" activity={null} />}
      {vacantDesks.map((at) => (
        <Desk key={`vacant-${at.x}-${at.y}`} at={at} name={null} status="" activity={null} />
      ))}
      {placed.map(({ member, desk, activity }) => (
        <Desk
          key={`desk-${member.id}`}
          at={desk}
          name={member.display_name}
          activity={activity}
          status={statusLabel(
            activity,
            Boolean(member.paused_at),
            member.pane_key ? (toolByPane[member.pane_key] ?? '') : ''
          )}
        />
      ))}
    </svg>
  )
}
