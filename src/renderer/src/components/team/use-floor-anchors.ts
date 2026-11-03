import { useLayoutEffect, useState, type RefObject } from 'react'

export type FloorAnchorPoint = { x: number; y: number; width: number }

/**
 * Bottom-centre of every `data-floor-anchor` element, relative to the plan, re-measured whenever the
 * plan resizes or its anchors change.
 */
export function useFloorAnchors(
  planRef: RefObject<HTMLElement | null>,
  layoutKey: string
): Map<string, FloorAnchorPoint> {
  const [anchors, setAnchors] = useState<Map<string, FloorAnchorPoint>>(() => new Map())
  useLayoutEffect(() => {
    const plan = planRef.current
    if (!plan) {
      return undefined
    }
    const measure = (): void => {
      const origin = plan.getBoundingClientRect()
      const next = new Map<string, FloorAnchorPoint>()
      for (const element of plan.querySelectorAll<HTMLElement>('[data-floor-anchor]')) {
        const name = element.dataset.floorAnchor
        if (!name) {
          continue
        }
        const rect = element.getBoundingClientRect()
        next.set(name, {
          x: rect.left - origin.left + rect.width / 2,
          y: rect.bottom - origin.top,
          width: rect.width
        })
      }
      setAnchors(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(plan)
    return () => observer.disconnect()
  }, [planRef, layoutKey])
  return anchors
}
