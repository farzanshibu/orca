import React from 'react'
import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { OfficeFloorPlan } from './office-floor-plan'
import { pointPlacement } from './office-floor-placement'
import { receptionNoteSheets, receptionWaitingLabel } from './office-floor-reception-notes'
import { Px } from './office-floor-sprite'
import { stagedBoxes } from './office-floor-staged-boxes'
import { CardboardBox } from './office-floor-warehouse'
import type { FloorWork } from './office-floor-work'

/**
 * The team's work drawn into the scene: a box in the staging area per finished task, and a note in
 * the reception tray per thing waiting on the human.
 */
export function FloorWorkArt({
  plan,
  work
}: {
  plan: OfficeFloorPlan
  work: FloorWork
}): React.JSX.Element {
  const { staging, noteTray } = plan.fixtures
  return (
    <g>
      {stagedBoxes(staging, work.finished).spots.map((spot) => (
        <g key={`${spot.x}:${spot.y}`} data-staged-box="">
          <CardboardBox x={spot.x} y={spot.y} />
        </g>
      ))}
      {receptionNoteSheets(noteTray, work.waiting).map(({ x, y, w, h }) => (
        <g key={y} data-reception-note="">
          <Px x={x} y={y} w={w} h={h} c="paper" />
          <Px x={x} y={y + h - 1} w={w} h={1} c="paper-line" />
        </g>
      ))}
    </g>
  )
}

/**
 * The words that go with that art: the ticket on each busy desk, the count once the staging area
 * is full, and the button that takes the human to what is waiting. Only the button takes the
 * pointer, so the desks underneath stay clickable.
 */
export function FloorWorkOverlay({
  plan,
  work
}: {
  plan: OfficeFloorPlan
  work: FloorWork
}): React.JSX.Element {
  const setTab = useAppStore((state) => state.setTeamPageTab)
  const { staging, receptionDesk } = plan.fixtures
  const { overflowCount } = stagedBoxes(staging, work.finished)
  return (
    <div className="pointer-events-none absolute inset-0">
      {work.tickets.map(({ memberId, ref, at }) => (
        <span
          key={memberId}
          aria-hidden="true"
          data-desk-ticket={ref}
          style={pointPlacement(plan, at)}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-card px-0.5 font-mono text-[11px] leading-[14px] whitespace-nowrap text-card-foreground shadow-xs"
        >
          {ref}
        </span>
      ))}
      {overflowCount === null ? null : (
        <span
          aria-hidden="true"
          data-staged-box-count={overflowCount}
          style={pointPlacement(plan, { x: staging.x + staging.w, y: staging.y })}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background px-1 text-[11px] leading-[14px] font-medium text-foreground tabular-nums"
        >
          {translate('team.floor.warehouse.boxCount', '×{{count}}', { count: overflowCount })}
        </span>
      )}
      {work.waiting > 0 ? (
        <div
          data-reception-waiting={work.waiting}
          style={pointPlacement(plan, {
            x: receptionDesk.x + receptionDesk.w / 2,
            y: receptionDesk.y + receptionDesk.h + 4
          })}
          // Why a backing: the outline button is translucent in dark mode; the floor would show through.
          className="pointer-events-auto absolute -translate-x-1/2 rounded-md bg-background"
        >
          <Button size="xs" variant="outline" onClick={() => setTab('inbox')}>
            <Inbox />
            {receptionWaitingLabel(work.waiting)}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
