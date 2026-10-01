import {
  pointOnSegment,
  samePoint,
  segmentLength,
  type FloorPoint,
  type FloorSegment
} from './office-floor-geometry'
import type { FloorAnchorId, OfficeFloorPlan } from './office-floor-plan-parts'

/** A walk between two anchors: the corner points in order, and how far it is in art units. */
export type FloorRoute = { points: readonly FloorPoint[]; length: number }

export type FloorNavigation = {
  /**
   * The walk from one anchor to another along the plan's aisles, or null when the plan has no such
   * anchor. The same pair always gives the same route, and the way back retraces it.
   */
  routeBetween: (from: FloorAnchorId, to: FloorAnchorId) => FloorRoute | null
}

// Why: of two walks of nearly equal length, the one with fewer corners reads as more deliberate.
const TURN_COST = 6

type WalkGraph = {
  points: FloorPoint[]
  /** Per point, the points one straight step away, in ascending index order. */
  links: number[][]
  indexAt: Map<string, number>
}

function pointKey({ x, y }: FloorPoint): string {
  return `${x},${y}`
}

function isAcross({ from, to }: FloorSegment): boolean {
  return from.y === to.y
}

/** Where a horizontal and a vertical run meet, if they do. */
function crossing(a: FloorSegment, b: FloorSegment): FloorPoint | null {
  if (isAcross(a) === isAcross(b)) {
    return null
  }
  const [across, down] = isAcross(a) ? [a, b] : [b, a]
  const point = { x: down.from.x, y: across.from.y }
  return pointOnSegment(point, across) && pointOnSegment(point, down) ? point : null
}

/**
 * The graph a character walks: every aisle, plus the short step from each anchor to its aisle.
 * Runs are joined wherever they touch, so the only way between rooms is through an aisle that
 * the plan laid across a door.
 */
function walkGraph(plan: OfficeFloorPlan): WalkGraph {
  const runs: FloorSegment[] = [
    ...plan.aisles,
    ...plan.anchors
      .filter((anchor) => !samePoint(anchor.point, anchor.approach))
      .map((anchor) => ({ from: anchor.point, to: anchor.approach }))
  ]
  const stops = new Map<string, FloorPoint>()
  const addStop = (point: FloorPoint): void => {
    stops.set(pointKey(point), point)
  }
  for (const anchor of plan.anchors) {
    addStop(anchor.point)
  }
  runs.forEach((run, index) => {
    addStop(run.from)
    addStop(run.to)
    for (const other of runs.slice(index + 1)) {
      const point = crossing(run, other)
      if (point) {
        addStop(point)
      }
    }
  })
  // Sorted so the graph, and with it every tie-break, does not depend on the order runs were laid.
  const points = [...stops.values()].sort((a, b) => a.y - b.y || a.x - b.x)
  const indexAt = new Map(points.map((point, index) => [pointKey(point), index]))
  const linked = points.map(() => new Set<number>())
  for (const run of runs) {
    const along = points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => pointOnSegment(point, run))
    for (let step = 1; step < along.length; step += 1) {
      linked[along[step - 1].index].add(along[step].index)
      linked[along[step].index].add(along[step - 1].index)
    }
  }
  return { points, links: linked.map((set) => [...set].sort((a, b) => a - b)), indexAt }
}

type WalkSearch = { cost: number[]; cameFrom: number[] }

/**
 * Cheapest walks from one graph point to all the others, counting each corner as a few extra
 * units. A state is a point plus the axis it was entered along, so turning can be priced.
 */
function searchFrom(graph: WalkGraph, start: number): WalkSearch {
  const stateCount = graph.points.length * 2
  const cost = Array.from({ length: stateCount }, () => Number.POSITIVE_INFINITY)
  const cameFrom = Array.from({ length: stateCount }, () => -1)
  const settled = Array.from({ length: stateCount }, () => false)
  cost[start * 2] = 0
  cost[start * 2 + 1] = 0
  for (;;) {
    // Strictly-less keeps the lowest state on a tie, which is what makes routes repeatable.
    let current = -1
    for (let state = 0; state < stateCount; state += 1) {
      if (
        !settled[state] &&
        cost[state] < (current < 0 ? Number.POSITIVE_INFINITY : cost[current])
      ) {
        current = state
      }
    }
    if (current < 0) {
      return { cost, cameFrom }
    }
    settled[current] = true
    const at = current >> 1
    for (const next of graph.links[at]) {
      const step = { from: graph.points[at], to: graph.points[next] }
      const axis = isAcross(step) ? 0 : 1
      const turned = at !== start && axis !== (current & 1)
      const nextCost = cost[current] + segmentLength(step) + (turned ? TURN_COST : 0)
      const state = next * 2 + axis
      if (nextCost < cost[state]) {
        cost[state] = nextCost
        cameFrom[state] = current
      }
    }
  }
}

function walkTo({ cost, cameFrom }: WalkSearch, goal: number): number[] | null {
  const arrival = cost[goal * 2 + 1] < cost[goal * 2] ? goal * 2 + 1 : goal * 2
  if (cost[arrival] === Number.POSITIVE_INFINITY) {
    return null
  }
  const walk: number[] = []
  for (let state = arrival; state >= 0; state = cameFrom[state]) {
    walk.unshift(state >> 1)
  }
  return walk
}

function withoutStraightStops(points: readonly FloorPoint[]): FloorPoint[] {
  return points.filter((point, index) => {
    const before = points[index - 1]
    const after = points[index + 1]
    if (!before || !after) {
      return true
    }
    return (
      !(before.x === point.x && point.x === after.x) &&
      !(before.y === point.y && point.y === after.y)
    )
  })
}

function routeLength(points: readonly FloorPoint[]): number {
  return points.reduce(
    (total, point, index) =>
      index === 0 ? 0 : total + segmentLength({ from: points[index - 1], to: point }),
    0
  )
}

function createNavigation(plan: OfficeFloorPlan): FloorNavigation {
  const graph = walkGraph(plan)
  const stopOf = new Map(
    plan.anchors.map((anchor) => [anchor.id, graph.indexAt.get(pointKey(anchor.point)) ?? -1])
  )
  const routes = new Map<string, FloorRoute | null>()
  const searches = new Map<number, WalkSearch>()
  const searchAt = (start: number): WalkSearch => {
    let search = searches.get(start)
    if (!search) {
      search = searchFrom(graph, start)
      searches.set(start, search)
    }
    return search
  }

  /** Always searched from the lower anchor id, so the walk back is the walk there reversed. */
  const forward = (from: FloorAnchorId, to: FloorAnchorId): FloorRoute | null => {
    const key = `${from}>${to}`
    const cached = routes.get(key)
    if (cached !== undefined) {
      return cached
    }
    const start = stopOf.get(from)
    const goal = stopOf.get(to)
    const walk =
      start === undefined || goal === undefined || start < 0 || goal < 0
        ? null
        : walkTo(searchAt(start), goal)
    const points = walk ? withoutStraightStops(walk.map((index) => graph.points[index])) : null
    const route = points ? { points, length: routeLength(points) } : null
    routes.set(key, route)
    return route
  }

  return {
    routeBetween(from, to) {
      if (from <= to) {
        return forward(from, to)
      }
      const key = `${from}>${to}`
      const cached = routes.get(key)
      if (cached !== undefined) {
        return cached
      }
      const there = forward(to, from)
      const back = there ? { points: there.points.toReversed(), length: there.length } : null
      routes.set(key, back)
      return back
    }
  }
}

const navigations = new WeakMap<OfficeFloorPlan, FloorNavigation>()

/** The walk graph for a plan. Built once per plan; its routes are cached for as long as the plan is. */
export function floorNavigation(plan: OfficeFloorPlan): FloorNavigation {
  let navigation = navigations.get(plan)
  if (!navigation) {
    navigation = createNavigation(plan)
    navigations.set(plan, navigation)
  }
  return navigation
}
