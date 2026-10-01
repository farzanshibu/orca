import {
  AISLE,
  BACK_WALL,
  PARTITION,
  POD,
  WALL,
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
const HALL_LANE_INSET = 10
// Each side lane is this far from its wall and from the pod, wide enough for the rooms above.
const SIDE_LANE = 12
// Bare floor above the first pod row, for its lane and the names over its heads.
const POD_HEAD = AISLE

/**
 * Narrow floors, one pod wide. The rooms stack: conference room on the back wall, the manager's
 * office beside the kitchen, then reception, the bullpen, and the warehouse. The conference room
 * is reached through the kitchen, and reception's lane is the hall.
 */
export function stackedPlan(podCount: number): OfficeFloorPlan {
  const draft = emptyDraft()
  const rows = podRows(podCount, 1)
  const innerW = POD.w + SIDE_LANE * 4
  const right = WALL + innerW
  const officeTop = BACK_WALL + BACK_ROOM_H + PARTITION
  const officeBottom = officeTop + BACK_ROOM_H
  const receptionTop = officeBottom + PARTITION
  const hallY = receptionTop + HALL_LANE_INSET
  const receptionBottom = receptionTop + RECEPTION_STRIP_H
  const bullpenTop = receptionBottom + PARTITION
  const podsTop = bullpenTop + POD_HEAD
  const bullpenBottom = podsTop + podRowsHeight(rows) + POD_FOOT
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
  const aisles = [bullpen.x + SIDE_LANE, right - SIDE_LANE]
  const store = furnishWarehouse(draft, warehouse, [aisles[1]])

  laneAcross(draft, hallY, reception.x + 8, aisles[1])
  laneDown(draft, aisles[0], hallY, podRowLaneY(podsTop, rows))
  laneDown(draft, aisles[1], hallY, store.laneY)
  addPodRowLanes(draft, podsTop, rows, aisles[0], aisles[1])
  const pods = Array.from({ length: Math.max(1, podCount) }, (_, index) =>
    addPod(draft, index, 'bullpen', {
      x: bullpen.x + SIDE_LANE * 2,
      y: podsTop + index * POD_ROW_PITCH
    })
  )

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
    vacantSlots: [],
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
