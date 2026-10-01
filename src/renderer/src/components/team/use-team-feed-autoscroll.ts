import { useCallback, useLayoutEffect, useRef, useState, type UIEventHandler } from 'react'
import {
  distanceFromBottom,
  nextFollowingEnd,
  shouldShowJumpToLatest,
  type ScrollGeometry
} from '../native-chat/native-chat-autoscroll'

function geometryOf(element: HTMLElement): ScrollGeometry {
  return {
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight
  }
}

export type TeamFeedAutoscroll = {
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: UIEventHandler<HTMLDivElement>
  /** The reader has scrolled away from the newest row. */
  detached: boolean
  /** The newest sequence that was on screen while the list still followed the end. */
  seenThroughSequence: number
  jumpToLatest: () => void
}

/**
 * Keeps a feed pinned to its newest row until the reader scrolls away, and says how far they had
 * read so the list can count what arrived since. `latestSequence` is the last row's.
 */
export function useTeamFeedAutoscroll(
  latestSequence: number,
  rowCount: number
): TeamFeedAutoscroll {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const following = useRef(true)
  const previousDistanceFromEnd = useRef(0)
  // Where the list last put the viewport itself, so that scroll event is not read as the reader's.
  const pinnedTop = useRef<number | null>(null)
  const latest = useRef(latestSequence)
  const [detached, setDetached] = useState(false)
  const [seenThroughSequence, setSeenThroughSequence] = useState(latestSequence)

  const pinToEnd = useCallback((element: HTMLDivElement) => {
    element.scrollTop = element.scrollHeight
    pinnedTop.current = element.scrollTop
    previousDistanceFromEnd.current = 0
    setSeenThroughSequence(latest.current)
    setDetached(false)
  }, [])

  useLayoutEffect(() => {
    latest.current = latestSequence
    const element = scrollRef.current
    if (!element) {
      return
    }
    if (following.current) {
      pinToEnd(element)
    } else {
      // New rows move the end away without a scroll event, so the pill is decided here too.
      setDetached(shouldShowJumpToLatest(false, geometryOf(element)))
    }
    // `rowCount` too: a filter change moves the end without a newer row arriving.
  }, [latestSequence, pinToEnd, rowCount])

  const onScroll = useCallback<UIEventHandler<HTMLDivElement>>((event) => {
    const geometry = geometryOf(event.currentTarget)
    const programmatic =
      pinnedTop.current !== null && Math.abs(geometry.scrollTop - pinnedTop.current) <= 1
    pinnedTop.current = null
    following.current = nextFollowingEnd({
      following: following.current,
      programmatic,
      geometry,
      previousDistanceFromEnd: previousDistanceFromEnd.current
    })
    previousDistanceFromEnd.current = distanceFromBottom(geometry)
    if (following.current) {
      setSeenThroughSequence(latest.current)
    }
    setDetached(shouldShowJumpToLatest(following.current, geometry))
  }, [])

  const jumpToLatest = useCallback(() => {
    following.current = true
    if (scrollRef.current) {
      pinToEnd(scrollRef.current)
    }
  }, [pinToEnd])

  return { scrollRef, onScroll, detached, seenThroughSequence, jumpToLatest }
}
