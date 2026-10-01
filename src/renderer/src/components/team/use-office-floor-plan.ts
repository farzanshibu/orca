import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  floorVariant,
  officeFloorPlan,
  type FloorVariant,
  type OfficeFloorPlan
} from './office-floor-plan'
import {
  EMPTY_SEATING,
  seatRoster,
  type FloorSeating,
  type SeatedMember
} from './office-floor-seating'

/** The arrangement that fits `frame`, or null until it has been measured. */
function useFloorVariant(frame: RefObject<HTMLElement | null>): FloorVariant | null {
  const [variant, setVariant] = useState<FloorVariant | null>(null)
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) {
      return undefined
    }
    // A zero width is a frame that is not laid out yet, not a narrow one.
    const measure = (width: number): void =>
      setVariant((previous) => (width > 0 ? floorVariant(width, previous) : previous))
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width))
    observer.observe(element)
    measure(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [frame])
  return variant
}

/**
 * Where everyone sits and the plan that has room for them. Seats persist for as long as the floor
 * is mounted, so a roster change moves only the member it is about; mount the floor per team.
 */
export function useOfficeFloorPlan(
  frame: RefObject<HTMLElement | null>,
  roster: readonly SeatedMember[]
): { plan: OfficeFloorPlan | null; seating: FloorSeating } {
  const variant = useFloorVariant(frame)
  const seated = useRef<FloorSeating>(EMPTY_SEATING)
  // Why a ref written during render: seatRoster is idempotent and returns its input when nothing
  // changed, so a repeated or discarded render lands on the same seating.
  const seating = seatRoster(roster, seated.current)
  seated.current = seating
  return { plan: variant ? officeFloorPlan(variant, seating.pods.length) : null, seating }
}
