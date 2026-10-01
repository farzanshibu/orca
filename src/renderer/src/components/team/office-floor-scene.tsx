import React from 'react'
import { Kitchen } from './office-floor-kitchen'
import type { OfficeFloorPlan } from './office-floor-plan'
import { PodBlock } from './office-floor-pods'
import { CommonAreas, ConferenceRoom, ManagerOffice, Reception } from './office-floor-rooms'
import { OfficeShell, OfficeWalls } from './office-floor-shell'
import { Warehouse } from './office-floor-warehouse'

/**
 * Everything that never moves: the building, each room's furniture, and the pods' desk blocks.
 * What changes with the roster (monitors, chairs, people) is drawn over it, desk by desk.
 */
export function OfficeBackdrop({
  plan,
  whiteboardBlank
}: {
  plan: OfficeFloorPlan
  /** The overlay is writing on the whiteboard, so the scribbles are left off. */
  whiteboardBlank: boolean
}): React.JSX.Element {
  return (
    <g>
      <OfficeShell plan={plan} />
      <ManagerOffice plan={plan} />
      <ConferenceRoom plan={plan} whiteboardBlank={whiteboardBlank} />
      <Kitchen plan={plan} />
      <Reception plan={plan} />
      <CommonAreas plan={plan} />
      <Warehouse plan={plan} />
      {/* After the rooms, so a wall's glass and an open door lie over the floor dressing. */}
      <OfficeWalls plan={plan} />
      {plan.pods.map((pod) => (
        <PodBlock key={pod.index} pod={pod} />
      ))}
    </g>
  )
}
