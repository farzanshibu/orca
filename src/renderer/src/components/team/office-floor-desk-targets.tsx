import React from 'react'
import { Plus } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { FloorDesk, OfficeFloorPlan } from './office-floor-plan'
import { rectPlacement } from './office-floor-placement'
import { MemberSummary, floorActivityLabel, type PlacedMember } from './office-floor-roster'
import type { TeamMemberDraft } from './team-runtime-client'

/** What the hire dialog starts from when a vacant desk is clicked. */
export type DeskHirePrefill = Pick<Partial<TeamMemberDraft>, 'role' | 'manager'>

export type FloorDeskTarget =
  | { desk: FloorDesk; entry: PlacedMember }
  | { desk: FloorDesk; entry: undefined; prefill: DeskHirePrefill }

function vacantDeskLabel(prefill: DeskHirePrefill): string {
  if (prefill.manager) {
    return translate('team.floor.openLeadDesk', 'Open desk · Lead')
  }
  return prefill.role
    ? translate('team.floor.openDeskRole', 'Open desk · {{role}}', { role: prefill.role })
    : translate('team.floor.openDesk', 'Open desk')
}

/**
 * One button per desk, laid over the scene and under the characters, so a desk stays clickable
 * and focusable wherever its occupant is. A member's desk opens their room and previews them on
 * hover; a vacant one starts a hire for that pod's role.
 */
export function FloorDeskTargets({
  plan,
  targets,
  onOpenRoom,
  onHire
}: {
  plan: OfficeFloorPlan
  targets: readonly FloorDeskTarget[]
  onOpenRoom: (memberId: string) => void
  onHire: (prefill: DeskHirePrefill) => void
}): React.JSX.Element {
  return (
    <div className="absolute inset-0">
      {targets.map((target) => {
        const style = rectPlacement(plan, target.desk.cell)
        if (!target.entry) {
          const label = vacantDeskLabel(target.prefill)
          return (
            <Tooltip key={target.desk.anchor}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  style={style}
                  onClick={() => onHire(target.prefill)}
                  className="group absolute flex items-center justify-center rounded-md border border-transparent outline-none hover:border-foreground/35 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="rounded-full bg-background/80 p-0.5 text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground">
                    <Plus className="size-3" />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {label}
              </TooltipContent>
            </Tooltip>
          )
        }
        const { member, activity } = target.entry
        return (
          <HoverCard key={target.desk.anchor} openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                aria-label={`${member.display_name}, ${floorActivityLabel(activity, Boolean(member.paused_at))}`}
                style={style}
                onClick={() => onOpenRoom(member.id)}
                className="absolute rounded-md border border-transparent outline-none hover:border-foreground/35 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </HoverCardTrigger>
            <HoverCardContent side="top">
              <div className="flex items-center gap-3">
                <MemberSummary entry={target.entry} />
              </div>
            </HoverCardContent>
          </HoverCard>
        )
      })}
    </div>
  )
}
