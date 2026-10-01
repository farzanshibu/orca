import {
  AISLE,
  BACK_WALL,
  PARTITION,
  POD,
  WALL,
  type FloorRoomId,
  type OfficeFloorPlan
} from './office-floor-plan-parts'
import {
  BACK_ROOM_H,
  POD_FOOT,
  WAREHOUSE_H,
  finishPlan,
  room
} from './office-floor-plan-arrangement'
import {
  POD_COLUMN_PITCH,
  POD_ROW_PITCH,
  addPod,
  addPodRowLanes,
  podRowLaneY,
  podRows,
  podRowsHeight
} from './office-floor-plan-pods'
import {
  addWall,
  doorAcross,
  doorDown,
  emptyDraft,
  furnishConference,
  furnishKitchen,
  furnishManagerOffice,
  furnishReception,
  furnishWarehouse,
  laneAcross,
  laneDown
} from './office-floor-plan-rooms'

const RECEPTION_W = 88
// The strip of floor above the first pod row; the hall lane along it is that row's upper lane.
const HALL_H = 18
const BULLPEN_PODS = 2
const BULLPEN_W = AISLE + BULLPEN_PODS * POD_COLUMN_PITCH
const ANNEX_W = AISLE + POD_COLUMN_PITCH

/**
 * Medium and wide floors. Back wall: the manager's office, the conference room, the kitchen.
 * Middle: reception, the bullpen, and on wide floors an annex that takes every third pod.
 * Bottom: the warehouse. One hall lane under the back rooms links every door.
 */
export function sideBySidePlan(variant: 'medium' | 'wide', podCount: number): OfficeFloorPlan {
  const draft = emptyDraft()
  const wide = variant === 'wide'
  const podColumns = wide ? BULLPEN_PODS + 1 : BULLPEN_PODS
  const rows = podRows(podCount, podColumns)
  const backBottom = BACK_WALL + BACK_ROOM_H
  const middleTop = backBottom + PARTITION
  const podsTop = middleTop + HALL_H
  const hallY = podRowLaneY(podsTop, 0)
  const middleBottom = podsTop + podRowsHeight(rows) + POD_FOOT
  const middleH = middleBottom - middleTop
  const warehouseTop = middleBottom + PARTITION
  const bullpenX = WALL + RECEPTION_W + PARTITION
  const bullpenRight = bullpenX + BULLPEN_W
  const annexX = bullpenRight + PARTITION
  const right = wide ? annexX + ANNEX_W : bullpenRight
  const width = right + WALL
  const height = warehouseTop + WAREHOUSE_H + WALL

  const manager = room(draft, 'manager', {
    x: WALL,
    y: BACK_WALL,
    w: RECEPTION_W,
    h: BACK_ROOM_H
  })
  const conferenceW = wide ? BULLPEN_W : 164
  const conference = room(draft, 'conference', {
    x: bullpenX,
    y: BACK_WALL,
    w: conferenceW,
    h: BACK_ROOM_H
  })
  const kitchenX = bullpenX + conferenceW + PARTITION
  const kitchen = room(draft, 'kitchen', {
    x: kitchenX,
    y: BACK_WALL,
    w: right - kitchenX,
    h: BACK_ROOM_H
  })
  const reception = room(draft, 'reception', {
    x: WALL,
    y: middleTop,
    w: RECEPTION_W,
    h: middleH
  })
  const bullpen = room(draft, 'bullpen', { x: bullpenX, y: middleTop, w: BULLPEN_W, h: middleH })
  const annex = wide
    ? room(draft, 'annex', { x: annexX, y: middleTop, w: ANNEX_W, h: middleH })
    : null
  const warehouse = room(draft, 'warehouse', {
    x: WALL,
    y: warehouseTop,
    w: right - WALL,
    h: WAREHOUSE_H
  })

  const office = furnishManagerOffice(draft, manager, hallY)
  const meeting = furnishConference(draft, conference, { side: 'left', y: hallY })
  // The kitchen door lines up with an aisle of the room below it.
  const kitchenBelow: FloorRoomId = annex ? 'annex' : 'bullpen'
  const kitchenDoorX = annex ? annex.x + AISLE / 2 : bullpenRight - AISLE / 2
  const kitchenCounter = furnishKitchen(draft, kitchen, kitchenDoorX, hallY)
  const front = furnishReception(draft, reception, hallY, 24)

  const bullpenAisles = Array.from(
    { length: BULLPEN_PODS + 1 },
    (_, column) => bullpen.x + AISLE / 2 + column * POD_COLUMN_PITCH
  )
  const annexAisles = annex ? [annex.x + AISLE / 2, annex.x + annex.w - AISLE / 2] : []
  // Warehouse doors sit at the foot of the bullpen's middle aisle and the annex's far one.
  const warehouseDoorXs = annex ? [bullpenAisles[1], annexAisles[1]] : [bullpenAisles[1]]
  const store = furnishWarehouse(draft, warehouse, warehouseDoorXs)
  const lastLaneY = podRowLaneY(podsTop, rows)

  laneAcross(draft, hallY, reception.x + 8, right - AISLE / 2)
  for (const x of [...bullpenAisles, ...annexAisles]) {
    laneDown(draft, x, hallY, warehouseDoorXs.includes(x) ? store.laneY : lastLaneY)
  }
  addPodRowLanes(draft, podsTop, rows, bullpenAisles[0], bullpenAisles[BULLPEN_PODS])
  if (annex) {
    addPodRowLanes(draft, podsTop, rows, annexAisles[0], annexAisles[1])
  }

  const slots = Array.from({ length: rows * podColumns }, (_, index) => {
    const column = index % podColumns
    const y = podsTop + Math.floor(index / podColumns) * POD_ROW_PITCH
    return annex && column === BULLPEN_PODS
      ? { room: 'annex' as const, origin: { x: annex.x + AISLE, y } }
      : {
          room: 'bullpen' as const,
          origin: { x: bullpen.x + AISLE + column * POD_COLUMN_PITCH, y }
        }
  })
  const podTotal = Math.max(1, podCount)
  const pods = slots
    .slice(0, podTotal)
    .map(({ room: podRoom, origin }, index) => addPod(draft, index, podRoom, origin))
  const vacantSlots = slots
    .slice(podTotal)
    .map(({ room: slotRoom, origin }) => ({ room: slotRoom, rect: { ...origin, ...POD } }))

  // Each wall under a back room also covers the corner where the next partition meets it.
  addWall(draft, { x: WALL, y: backBottom, w: bullpenX - WALL, h: PARTITION }, 'glass', [
    doorAcross('manager-reception', ['manager', 'reception'], office.doorX, backBottom)
  ])
  addWall(
    draft,
    { x: bullpenX, y: backBottom, w: kitchenX - bullpenX, h: PARTITION },
    'partition',
    [doorAcross('conference-bullpen', ['conference', 'bullpen'], meeting.doorX, backBottom)]
  )
  addWall(draft, { x: kitchenX, y: backBottom, w: right - kitchenX, h: PARTITION }, 'partition', [
    doorAcross(`kitchen-${kitchenBelow}`, ['kitchen', kitchenBelow], kitchenDoorX, backBottom)
  ])
  addWall(draft, { x: bullpenX - PARTITION, y: BACK_WALL, w: PARTITION, h: BACK_ROOM_H }, 'glass')
  addWall(
    draft,
    { x: kitchenX - PARTITION, y: BACK_WALL, w: PARTITION, h: BACK_ROOM_H },
    'partition'
  )
  addWall(draft, { x: bullpenX - PARTITION, y: middleTop, w: PARTITION, h: middleH }, 'partition', [
    doorDown('reception-bullpen', ['reception', 'bullpen'], bullpenX - PARTITION, middleTop)
  ])
  if (annex) {
    addWall(draft, { x: bullpenRight, y: middleTop, w: PARTITION, h: middleH }, 'partition', [
      doorDown('bullpen-annex', ['bullpen', 'annex'], bullpenRight, middleTop)
    ])
  }
  addWall(draft, { x: WALL, y: middleBottom, w: right - WALL, h: PARTITION }, 'partition', [
    doorAcross('bullpen-warehouse', ['bullpen', 'warehouse'], warehouseDoorXs[0], middleBottom),
    ...(annex
      ? [doorAcross('annex-warehouse', ['annex', 'warehouse'], warehouseDoorXs[1], middleBottom)]
      : [])
  ])

  return finishPlan(draft, {
    variant,
    width,
    height,
    podColumns,
    pods,
    vacantSlots,
    managerDesk: office.desk,
    fixtures: {
      whiteboard: meeting.whiteboard,
      conferenceTable: meeting.table,
      kitchenCounter,
      ...front,
      shelf: store.shelf,
      staging: store.staging,
      dock: store.dock
    }
  })
}
