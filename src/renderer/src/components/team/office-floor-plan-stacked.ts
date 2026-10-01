import { AISLE, BACK_WALL, PARTITION, WALL, type OfficeFloorPlan } from './office-floor-plan-parts'
import {
  BACK_ROOM_H,
  HALL_LANE_INSET,
  POD_COLUMN_PITCH,
  POD_MARGIN,
  POD_ROW_PITCH,
  WAREHOUSE_H,
  finishPlan,
  lowestDeskLaneY,
  podRows,
  podRowsHeight,
  room
} from './office-floor-plan-arrangement'
import {
  addDeskRowLanes,
  addPod,
  addWall,
  doorAcross,
  emptyDraft,
  furnishConference,
  furnishKitchen,
  furnishManagerOffice,
  furnishReception,
  furnishWarehouse,
  laneAcross,
  laneDown
} from './office-floor-plan-rooms'

// Narrow floors stack the rooms; reception becomes a strip that doubles as the hall.
const RECEPTION_STRIP_H = 52

/**
 * Narrow floors, one pod wide. The rooms stack: conference room on the back wall, the manager's
 * office beside the kitchen, then reception, the bullpen, and the warehouse. The conference room
 * is reached through the kitchen, and reception's lane is the hall.
 */
export function stackedPlan(podCount: number): OfficeFloorPlan {
  const draft = emptyDraft()
  const rows = podRows(podCount, 1)
  const innerW = AISLE + POD_COLUMN_PITCH
  const right = WALL + innerW
  const officeTop = BACK_WALL + BACK_ROOM_H + PARTITION
  const officeBottom = officeTop + BACK_ROOM_H
  const receptionTop = officeBottom + PARTITION
  const hallY = receptionTop + HALL_LANE_INSET
  const receptionBottom = receptionTop + RECEPTION_STRIP_H
  const bullpenTop = receptionBottom + PARTITION
  const podsTop = bullpenTop + POD_MARGIN
  const bullpenBottom = podsTop + podRowsHeight(rows) + POD_MARGIN
  const warehouseTop = bullpenBottom + PARTITION
  const managerW = 76

  const conference = room(draft, 'conference', {
    x: WALL,
    y: BACK_WALL,
    w: innerW,
    h: BACK_ROOM_H
  })
  const manager = room(draft, 'manager', { x: WALL, y: officeTop, w: managerW, h: BACK_ROOM_H })
  const kitchenX = WALL + managerW + PARTITION
  const kitchen = room(draft, 'kitchen', {
    x: kitchenX,
    y: officeTop,
    w: right - kitchenX,
    h: BACK_ROOM_H
  })
  const reception = room(draft, 'reception', {
    x: WALL,
    y: receptionTop,
    w: innerW,
    h: RECEPTION_STRIP_H
  })
  const bullpen = room(draft, 'bullpen', {
    x: WALL,
    y: bullpenTop,
    w: innerW,
    h: bullpenBottom - bullpenTop
  })
  const warehouse = room(draft, 'warehouse', {
    x: WALL,
    y: warehouseTop,
    w: innerW,
    h: WAREHOUSE_H
  })

  const office = furnishManagerOffice(draft, manager, hallY)
  const meeting = furnishConference(draft, conference, { side: 'right', y: hallY })
  const kitchenCounter = furnishKitchen(draft, kitchen, meeting.doorX, hallY)
  const front = furnishReception(draft, reception, hallY, 12)
  const aisles = [bullpen.x + AISLE / 2, right - AISLE / 2]
  const store = furnishWarehouse(draft, warehouse, [aisles[1]])
  const lastLaneY = lowestDeskLaneY(podsTop, rows)

  laneAcross(draft, hallY, aisles[0], aisles[1])
  laneDown(draft, aisles[0], hallY, lastLaneY)
  laneDown(draft, aisles[1], hallY, store.laneY)
  const pods = Array.from({ length: Math.max(1, podCount) }, (_, index) => {
    const y = podsTop + index * POD_ROW_PITCH
    addDeskRowLanes(draft, y, aisles[0], aisles[1])
    return addPod(draft, index, 'bullpen', { x: bullpen.x + AISLE, y })
  })

  addWall(draft, { x: WALL, y: officeTop - PARTITION, w: innerW, h: PARTITION }, 'partition', [
    doorAcross(
      'conference-kitchen',
      ['conference', 'kitchen'],
      meeting.doorX,
      officeTop - PARTITION
    )
  ])
  addWall(draft, { x: WALL, y: officeBottom, w: kitchenX - WALL, h: PARTITION }, 'glass', [
    doorAcross('manager-reception', ['manager', 'reception'], office.doorX, officeBottom)
  ])
  addWall(draft, { x: kitchenX, y: officeBottom, w: right - kitchenX, h: PARTITION }, 'partition', [
    doorAcross('kitchen-reception', ['kitchen', 'reception'], meeting.doorX, officeBottom)
  ])
  addWall(draft, { x: kitchenX - PARTITION, y: officeTop, w: PARTITION, h: BACK_ROOM_H }, 'glass')
  addWall(draft, { x: WALL, y: receptionBottom, w: innerW, h: PARTITION }, 'partition', [
    doorAcross('reception-bullpen-left', ['reception', 'bullpen'], aisles[0], receptionBottom),
    doorAcross('reception-bullpen-right', ['reception', 'bullpen'], aisles[1], receptionBottom)
  ])
  addWall(draft, { x: WALL, y: bullpenBottom, w: innerW, h: PARTITION }, 'partition', [
    doorAcross('bullpen-warehouse', ['bullpen', 'warehouse'], aisles[1], bullpenBottom)
  ])

  return finishPlan(draft, {
    variant: 'narrow',
    width: right + WALL,
    height: warehouseTop + WAREHOUSE_H + WALL,
    podColumns: 1,
    pods,
    managerDesk: office.desk,
    fixtures: {
      whiteboard: meeting.whiteboard,
      conferenceTable: meeting.table,
      kitchenCounter,
      ...front,
      shelf: store.shelf,
      dock: store.dock
    }
  })
}
