import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { FloorCharacter } from './office-floor-character'
import { floorColumns, floorLayout, type FloorDesk } from './office-floor-layout'
import { FloorRoster, floorActivityLabel, type PlacedMember } from './office-floor-roster'
import { ROAM_INTERVAL_MS, roamTargets } from './office-floor-roaming'
import {
  ChairBack,
  ChairSeat,
  DeskTop,
  OfficeBackdrop,
  type ScreenState
} from './office-floor-scene'
import { memberLook } from './office-floor-sprite'
import { floorActivity, summarizeFloor } from './office-floor-state'
import { parseSqliteUtc } from './TeamTaskBoard'
import type { TeamAttention } from './team-attention'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamLogMessage, TeamMember, TeamTask } from './team-snapshot-types'
import { teamMemberCurrentTask } from './team-task-owner'
import { useTeamClock } from './use-team-clock'

// Mail newer than this marks the sender and recipient desks, so the floor shows traffic, not history.
const MAIL_WINDOW_MS = 10_000
// Upscaling past this makes the pixel art blurry-large on wide monitors.
const MAX_ART_SCALE = 3

function FloorSummaryLine({
  placed,
  waitingOnYou
}: {
  placed: readonly PlacedMember[]
  waitingOnYou: number
}): React.JSX.Element | null {
  const summary = summarizeFloor(
    placed.map(({ activity, member }) => ({ activity, paused: Boolean(member.paused_at) }))
  )
  const parts = [
    summary.working
      ? translate('team.floor.summary.working', '{{count}} working', {
          count: summary.working
        })
      : null,
    waitingOnYou
      ? translate('team.floor.summary.waiting', '{{count}} waiting on you', {
          count: waitingOnYou
        })
      : null,
    summary.idle
      ? translate('team.floor.summary.idle', '{{count}} on a break', {
          count: summary.idle
        })
      : null,
    summary.unverifiable
      ? translate('team.floor.summary.unverifiable', '{{count}} with no recent update', {
          count: summary.unverifiable
        })
      : null,
    summary.paused
      ? translate('team.floor.summary.paused', '{{count}} paused', {
          count: summary.paused
        })
      : null,
    summary.off
      ? translate('team.floor.summary.off', '{{count}} out of office', {
          count: summary.off
        })
      : null
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) {
    return null
  }
  return <span className="text-[12px] text-muted-foreground">{parts.join(' · ')}</span>
}

function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return undefined
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** Keyboard and pointer target for a desk, plus the nameplate under it. */
function DeskPlate({
  desk,
  label,
  status,
  dim,
  onActivate
}: {
  desk: FloorDesk
  label: string
  /** A second line under the name, for a state the desk alone does not show. */
  status?: string
  dim: boolean
  onActivate: () => void
}): React.JSX.Element {
  const { x, y, w, h } = desk.cell
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={status ? `${label}, ${status}` : label}
      className="team-office-desk cursor-pointer outline-none"
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivate()
        }
      }}
    >
      <rect x={x + 2} y={y} width={w - 4} height={h} rx={3} className="team-office-desk-hit" />
      <text
        x={x + w / 2}
        y={y + 62}
        textAnchor="middle"
        data-dim={dim ? 'true' : undefined}
        className="team-office-label"
      >
        {label}
      </text>
      {status ? (
        <text
          x={x + w / 2}
          y={y + 68}
          textAnchor="middle"
          data-dim="true"
          className="team-office-label"
        >
          {status}
        </text>
      ) : null}
    </g>
  )
}

export function TeamOfficeFloor({
  members,
  tasks,
  log,
  attention,
  onOpenRoom,
  onAddMember
}: {
  members: readonly TeamMember[]
  tasks: readonly TeamTask[]
  log: readonly TeamLogMessage[]
  attention: TeamAttention
  onOpenRoom: (memberId: string) => void
  onAddMember: () => void
}): React.JSX.Element {
  const now = useTeamClock(2_000)
  const frameRef = useRef<HTMLDivElement>(null)
  const containerWidth = useContainerWidth(frameRef)
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
  const placed: PlacedMember[] = members.map((member) => {
    const needsYou = attention.memberIds.has(member.id)
    return {
      member,
      activity: floorActivity({
        liveness: teamMemberLiveness(member),
        agentStatus: member.agent_status,
        paused: Boolean(member.paused_at),
        needsYou
      }),
      needsYou,
      tool: member.pane_key ? (toolByPane[member.pane_key] ?? '') : '',
      task: teamMemberCurrentTask(member, tasks),
      hasMail: member.live_handle !== null && mailHandles.has(member.live_handle)
    }
  })
  // Managers come first so the lead's corner office is stable when several are flagged.
  const ordered = [...placed].sort((a, b) => b.member.is_manager - a.member.is_manager)
  const manager = ordered.find((entry) => entry.member.is_manager)
  const staff = ordered.filter((entry) => entry !== manager)
  // One spare desk is always open, so hiring has an obvious place on the floor.
  const layout = floorLayout(staff.length + 1, floorColumns(containerWidth))
  const deskOf = new Map<string, FloorDesk>()
  if (manager) {
    deskOf.set(manager.member.id, layout.managerDesk)
  }
  staff.forEach((entry, index) => deskOf.set(entry.member.id, layout.desks[index]))
  const openDesk = layout.desks[staff.length]
  const targets = roamTargets(
    ordered.map(({ member, activity }) => ({
      id: member.id,
      slug: member.slug,
      activity
    })),
    layout.idleSpots.length,
    Math.floor(now / ROAM_INTERVAL_MS)
  )
  const seatedIds = new Set(
    ordered.filter((entry) => targets.get(entry.member.id)?.kind === 'desk').map((e) => e.member.id)
  )

  // A member with no recent update keeps its seat, but its monitor claims nothing about its work.
  const screenFor = (entry: PlacedMember | undefined): ScreenState => {
    if (!entry) {
      return 'vacant'
    }
    if (entry.activity === 'off' || entry.activity === 'unverifiable') {
      return 'off'
    }
    return seatedIds.has(entry.member.id) ? entry.activity : 'idle'
  }
  const deskEntries: { desk: FloorDesk; entry: PlacedMember | undefined }[] = [
    { desk: layout.managerDesk, entry: manager },
    ...layout.desks.map((desk, index) => ({ desk, entry: staff[index] }))
  ]

  return (
    <div className="scrollbar-sleek flex h-full w-full flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {translate('team.floor.office', 'Office')}
        </span>
        <FloorSummaryLine placed={placed} waitingOnYou={attention.count} />
      </div>
      <div ref={frameRef} className="w-full">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          shapeRendering="crispEdges"
          role="group"
          aria-label={translate('team.floor.office', 'Office')}
          className="team-office mx-auto block h-auto w-full rounded-lg"
          // Wide floors also cap by viewport height so the roster stays in view; narrow ones scroll.
          style={{
            maxWidth: layout.breakRoomBeside
              ? `min(${layout.width * MAX_ART_SCALE}px, calc(64vh * ${layout.width / layout.height}))`
              : layout.width * MAX_ART_SCALE
          }}
        >
          <OfficeBackdrop layout={layout} />
          {deskEntries.map(({ desk, entry }) => (
            <g key={`${desk.cell.x}:${desk.cell.y}`}>
              <DeskTop desk={desk} state={screenFor(entry)} />
              {entry && seatedIds.has(entry.member.id) ? null : (
                <>
                  <ChairSeat x={desk.cell.x} y={desk.cell.y} />
                  <ChairBack x={desk.cell.x} y={desk.cell.y} />
                </>
              )}
            </g>
          ))}
          {ordered.map((entry) => {
            const target = targets.get(entry.member.id)
            const desk = deskOf.get(entry.member.id)
            const spot =
              target?.kind === 'spot'
                ? layout.idleSpots[target.index]
                : target?.kind === 'desk'
                  ? desk?.seat
                  : undefined
            if (!spot) {
              return null
            }
            return (
              <FloorCharacter
                key={entry.member.id}
                id={entry.member.id}
                name={entry.member.display_name}
                look={memberLook(entry.member.slug, Boolean(entry.member.is_manager))}
                needsYou={entry.needsYou}
                seated={target?.kind === 'desk'}
                hasMail={entry.hasMail}
                x={spot.x}
                y={spot.y}
                onOpenRoom={onOpenRoom}
              />
            )
          })}
          {deskEntries.map(({ desk, entry }) =>
            entry ? (
              <DeskPlate
                key={entry.member.id}
                desk={desk}
                label={entry.member.display_name}
                status={
                  entry.activity === 'unverifiable'
                    ? floorActivityLabel(entry.activity, false)
                    : undefined
                }
                dim={entry.activity === 'off'}
                onActivate={() => onOpenRoom(entry.member.id)}
              />
            ) : null
          )}
          {openDesk ? (
            <DeskPlate
              desk={openDesk}
              label={translate('team.floor.openDesk', 'Open desk')}
              dim
              onActivate={onAddMember}
            />
          ) : null}
        </svg>
      </div>
      <FloorRoster placed={ordered} onOpenRoom={onOpenRoom} onAddMember={onAddMember} />
    </div>
  )
}
