import { useEffect, useState } from 'react'

/** Wall-clock milliseconds, refreshed on an interval, for time-relative rendering. */
export function useTeamClock(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
