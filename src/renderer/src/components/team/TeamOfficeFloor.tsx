import React, { useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { SeatedCharacter } from './office-floor-character'
import { ChairBack, ChairSeat, DeskTop, type ScreenState } from './office-floor-desk-art'
import {
  FloorDeskTargets,
  type DeskHirePrefill,
  type FloorDeskTarget
} from './office-floor-desk-targets'
import { FloorOverlay, type FloorBadge, type FloorNameplate } from './office-floor-overlay'
import { officeFloorPlan, type FloorDesk, type OfficeFloorPlan } from './office-floor-plan'
import { FloorRoster, floorActivityLabel, type PlacedMember } from './office-floor-roster'
import { OfficeBackdrop } from './office-floor-scene'
import type { FloorSeating } from './office-floor-seating'
import { memberLook } from './office-floor-sprite'
import { floorActivity, summarizeFloor } from './office-floor-state'
import { parseSqliteUtc } from './TeamTaskBoard'
import type { TeamAttention } from './team-attention'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamLogMessage, TeamMember, TeamTask } from './team-snapshot-types'
import { teamMemberCurrentTask } from './team-task-owner'
import { useOfficeFloorPlan } from './use-office-floor-plan'
import { useTeamClock } from './use-team-clock'

// Mail newer than this marks the sender and recipient desks, so the floor shows traffic, not history.
const MAIL_WINDOW_MS = 10_000
// Upscaling past this makes the pixel art blurry-large on wide monitors.
const MAX_ART_SCALE = 3
// From a desk cell's top to its nameplate, just under the chair.
const NAMEPLATE_OFFSET = 57

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

type DeskEntry = { desk: FloorDesk; entry: PlacedMember | undefined; prefill: DeskHirePrefill }

/** Every desk on the plan with whoever the seating puts at it. */
function deskEntries(
  plan: OfficeFloorPlan,
  seating: FloorSeating,
  placed: readonly PlacedMember[]
): DeskEntry[] {
  const byId = new Map(placed.map((entry) => [entry.member.id, entry]))
  const manager = placed.find((entry) => seating.seats.get(entry.member.id)?.kind === 'manager')
  return [
    { desk: plan.managerDesk, entry: manager, prefill: { manager: true } },
    ...plan.pods.flatMap((pod) => {
      const seated = seating.pods[pod.index]
      return pod.desks.map((desk, index) => ({
        desk,
        entry: byId.get(seated?.desks[index] ?? ''),
        prefill: seated?.role ? { role: seated.role } : {}
      }))
    })
  ]
}

/** A member with no recent update keeps its seat, but its monitor claims nothing about its work. */
function screenFor(entry: PlacedMember | undefined): ScreenState {
  if (!entry) {
    return 'vacant'
  }
  return entry.activity === 'off' || entry.activity === 'unverifiable' ? 'off' : entry.activity
}

// A stopped or paused member is out of the office; everyone else is at their desk.
function isPresent(entry: PlacedMember | undefined): entry is PlacedMember {
  return entry !== undefined && entry.activity !== 'off'
}

/** Wide floors also cap by viewport height so the roster stays in view; narrow ones scroll. */
function floorMaxWidth(plan: OfficeFloorPlan): string | number {
  const scaled = plan.width * MAX_ART_SCALE
  if (plan.variant === 'narrow') {
    return scaled
  }
  // Sized from a one-row floor, so more pod rows make the floor longer instead of shrinking the art.
  const aspect = plan.width / officeFloorPlan(plan.variant, 1).height
  return `min(${scaled}px, calc(64vh * ${aspect}))`
}

export function TeamOfficeFloor({
  teamName,
  members,
  tasks,
  log,
  attention,
  whiteboard,
  onOpenRoom,
  onAddMember
}: {
  teamName: string
  members: readonly TeamMember[]
  tasks: readonly TeamTask[]
  log: readonly TeamLogMessage[]
  attention: TeamAttention
  /** What is written on the whiteboard. Nothing supplies it yet, so the board shows scribbles. */
  whiteboard?: React.ReactNode
  onOpenRoom: (memberId: string) => void
  /** `prefill` is set when a vacant desk was clicked: that pod's role, or the manager's office. */
  onAddMember: (prefill?: DeskHirePrefill) => void
}): React.JSX.Element {
  const now = useTeamClock(2_000)
  const frameRef = useRef<HTMLDivElement>(null)
  const { plan, seating } = useOfficeFloorPlan(frameRef, members)
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
  // Managers come first so the roster leads with whoever runs the team.
  const ordered = [...placed].sort((a, b) => b.member.is_manager - a.member.is_manager)
  const desks = plan ? deskEntries(plan, seating, placed) : []
  const targets: FloorDeskTarget[] = desks.map(({ desk, entry, prefill }) =>
    entry ? { desk, entry } : { desk, entry, prefill }
  )
  const nameplates: FloorNameplate[] = desks.flatMap(({ desk, entry }) =>
    entry
      ? [
          {
            id: entry.member.id,
            at: { x: desk.cell.x + desk.cell.w / 2, y: desk.cell.y + NAMEPLATE_OFFSET },
            width: desk.cell.w,
            name: entry.member.display_name,
            status:
              entry.activity === 'unverifiable'
                ? floorActivityLabel(entry.activity, false)
                : undefined,
            dim: entry.activity === 'off'
          }
        ]
      : []
  )
  const badges: FloorBadge[] = desks.flatMap(({ desk, entry }) =>
    entry && (entry.needsYou || entry.hasMail)
      ? [
          {
            id: entry.member.id,
            // Beside the head: above it is the monitor.
            at: { x: desk.seat.x + 13, y: desk.seat.y - 15 },
            kind: entry.needsYou ? ('question' as const) : ('mail' as const)
          }
        ]
      : []
  )

  return (
    <div className="scrollbar-sleek flex h-full w-full flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {translate('team.floor.office', 'Office')}
        </span>
        <FloorSummaryLine placed={placed} waitingOnYou={attention.count} />
      </div>
      <div ref={frameRef} className="w-full">
        {plan ? (
          <div
            role="group"
            aria-label={translate('team.floor.office', 'Office')}
            className="relative mx-auto overflow-hidden rounded-lg"
            style={{ maxWidth: floorMaxWidth(plan) }}
          >
            <svg
              viewBox={`0 0 ${plan.width} ${plan.height}`}
              aria-hidden="true"
              className="team-office block h-auto w-full"
            >
              <OfficeBackdrop plan={plan} whiteboardBlank={whiteboard != null} />
              {desks.map(({ desk, entry }) => (
                <g key={desk.anchor}>
                  <DeskTop desk={desk} state={screenFor(entry)} />
                  {isPresent(entry) ? null : (
                    <>
                      <ChairSeat x={desk.cell.x} y={desk.cell.y} />
                      <ChairBack x={desk.cell.x} y={desk.cell.y} />
                    </>
                  )}
                </g>
              ))}
            </svg>
            <FloorDeskTargets
              plan={plan}
              targets={targets}
              onOpenRoom={onOpenRoom}
              onHire={onAddMember}
            />
            {/* Over the desk targets and blind to the pointer, so a desk stays clickable through its occupant. */}
            <svg
              viewBox={`0 0 ${plan.width} ${plan.height}`}
              aria-hidden="true"
              className="team-office pointer-events-none absolute inset-0 h-full w-full"
            >
              {desks.map(({ desk, entry }) =>
                isPresent(entry) ? (
                  <SeatedCharacter
                    key={entry.member.id}
                    desk={desk}
                    look={memberLook(entry.member.slug, Boolean(entry.member.is_manager))}
                  />
                ) : null
              )}
            </svg>
            <FloorOverlay
              plan={plan}
              teamName={teamName}
              whiteboard={whiteboard}
              nameplates={nameplates}
              badges={badges}
            />
          </div>
        ) : null}
      </div>
      <FloorRoster placed={ordered} onOpenRoom={onOpenRoom} onAddMember={() => onAddMember()} />
    </div>
  )
}
