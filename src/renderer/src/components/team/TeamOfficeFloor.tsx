import React, { useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { useOfficeProof } from './office-choreography-proof'
import { FloorActors } from './office-floor-actors'
import { FloorBubbles } from './office-floor-bubbles'
import { SeatedCharacter } from './office-floor-character'
import type { ScreenState } from './office-floor-desk-art'
import {
  FloorDeskTargets,
  type DeskHirePrefill,
  type FloorDeskTarget
} from './office-floor-desk-targets'
import { FloorOverlay, type FloorBadge, type FloorNameplate } from './office-floor-overlay'
import { officeFloorPlan, type FloorDesk, type OfficeFloorPlan } from './office-floor-plan'
import { DeskSetup } from './office-floor-pods'
import { FloorHighlightRing } from './office-floor-props'
import { FloorRoster, floorActivityLabel, type PlacedMember } from './office-floor-roster'
import { OfficeBackdrop } from './office-floor-scene'
import type { FloorSeating } from './office-floor-seating'
import { memberLook } from './office-floor-sprite'
import { floorActivity, summarizeFloor } from './office-floor-state'
import { FloorWhiteboard } from './office-floor-whiteboard'
import { floorWork } from './office-floor-work'
import { FloorWorkArt, FloorWorkOverlay } from './office-floor-work-layers'
import type { TeamAttention } from './team-attention'
import { useHighlightedTeamMemberIds } from './team-floor-highlight'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamGoal, TeamMember, TeamTask } from './team-snapshot-types'
import { teamMemberCurrentTask } from './team-task-owner'
import { useFloorThoughts } from './use-floor-thoughts'
import { useOfficeChoreography } from './use-office-choreography'
import { useOfficeFloorPlan } from './use-office-floor-plan'
import type { TeamActivity } from './use-team-activity'

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
  activity,
  attention,
  goals,
  onOpenRoom,
  onAddMember
}: {
  teamName: string
  members: readonly TeamMember[]
  tasks: readonly TeamTask[]
  /** The team's live activity; the floor acts out what arrives while it is on screen. */
  activity: Pick<TeamActivity, 'live' | 'epoch'>
  attention: TeamAttention
  goals: readonly TeamGoal[] | undefined
  onOpenRoom: (memberId: string) => void
  /** `prefill` is set when a vacant desk was clicked: that pod's role, or the manager's office. */
  onAddMember: (prefill?: DeskHirePrefill) => void
}): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  const { plan, seating } = useOfficeFloorPlan(frameRef, members)
  // Null except while a rendered probe drives the floor with its own clock and events.
  const proof = useOfficeProof()
  const highlighted = useHighlightedTeamMemberIds()
  const thoughts = useFloorThoughts(members)
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
  const placed: PlacedMember[] = members.map((member) => {
    const needsYou = attention.memberIds.has(member.id)
    return {
      member,
      activity:
        proof?.activity.get(member.id) ??
        floorActivity({
          liveness: teamMemberLiveness(member),
          agentStatus: member.agent_status,
          paused: Boolean(member.paused_at),
          needsYou
        }),
      needsYou,
      tool: member.pane_key ? (toolByPane[member.pane_key] ?? '') : '',
      task: teamMemberCurrentTask(member, tasks)
    }
  })
  const stage = useMemo(() => (plan ? { plan, seating } : null), [plan, seating])
  const choreography = useOfficeChoreography({ activity, stage, placed, proof })
  const { scene } = choreography
  // Whoever is out on an errand is drawn by the actors layer; their chair shows empty meanwhile.
  const atDesk = (entry: PlacedMember | undefined): entry is PlacedMember =>
    isPresent(entry) && !scene.poses.has(entry.member.id)
  // Managers come first so the roster leads with whoever runs the team.
  const ordered = [...placed].sort((a, b) => b.member.is_manager - a.member.is_manager)
  const desks = plan ? deskEntries(plan, seating, placed) : []
  const work = floorWork({ goals, tasks, members, desks, waiting: attention.count })
  const targets: FloorDeskTarget[] = desks.map(({ desk, entry, prefill }) =>
    entry ? { desk, entry } : { desk, entry, prefill }
  )
  const nameplates: FloorNameplate[] = desks.flatMap(({ desk, entry }) =>
    entry
      ? [
          {
            id: entry.member.id,
            ...desk.nameplate,
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
    entry && (entry.needsYou || scene.badges.get(entry.member.id) === 'mail')
      ? [
          {
            id: entry.member.id,
            // Beside the head, whichever way the desk faces.
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
            data-floor-meeting={scene.meeting ?? undefined}
            data-floor-clock={choreography.clock.manual ? 'manual' : undefined}
            data-floor-motion={choreography.reducedMotion ? 'reduced' : undefined}
            className="relative mx-auto overflow-hidden rounded-lg"
            style={{ maxWidth: floorMaxWidth(plan) }}
          >
            <svg
              viewBox={`0 0 ${plan.width} ${plan.height}`}
              aria-hidden="true"
              className="team-office block h-auto w-full"
            >
              <OfficeBackdrop plan={plan} whiteboardBlank={work.board !== null} />
              <FloorWorkArt plan={plan} work={work} />
              {desks.map(({ desk, entry }) => (
                <DeskSetup
                  key={desk.anchor}
                  desk={desk}
                  state={screenFor(entry)}
                  occupied={atDesk(entry)}
                />
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
                atDesk(entry) ? (
                  <g
                    key={entry.member.id}
                    data-floor-seated={entry.member.id}
                    data-activity={entry.activity}
                    data-highlighted={highlighted.has(entry.member.id) ? 'true' : undefined}
                  >
                    <SeatedCharacter
                      desk={desk}
                      look={memberLook(entry.member.slug, Boolean(entry.member.is_manager))}
                      screen={screenFor(entry)}
                    />
                    {highlighted.has(entry.member.id) ? (
                      <FloorHighlightRing at={desk.seat} />
                    ) : null}
                  </g>
                ) : null
              )}
            </svg>
            {stage ? (
              <FloorActors
                stage={stage}
                placed={placed}
                choreography={choreography}
                highlighted={highlighted}
              />
            ) : null}
            <FloorOverlay
              plan={plan}
              teamName={teamName}
              whiteboard={work.board ? <FloorWhiteboard content={work.board} /> : undefined}
              nameplates={nameplates}
              badges={badges}
            />
            <FloorWorkOverlay plan={plan} work={work} />
            <FloorBubbles plan={plan} desks={desks} scene={scene} thoughts={thoughts} />
          </div>
        ) : null}
      </div>
      <FloorRoster placed={ordered} onOpenRoom={onOpenRoom} onAddMember={() => onAddMember()} />
    </div>
  )
}
