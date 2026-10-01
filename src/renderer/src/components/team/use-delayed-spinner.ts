import { useEffect, useState } from 'react'

// A local call answers well inside this; only a slow link ever shows the spinner.
const SPINNER_DELAY_MS = 200

/** True once `busy` has lasted long enough to be worth showing; the disabled state is immediate. */
export function useDelayedSpinner(busy: boolean, delayMs = SPINNER_DELAY_MS): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!busy) {
      return
    }
    const timer = window.setTimeout(() => setShown(true), delayMs)
    return () => {
      window.clearTimeout(timer)
      setShown(false)
    }
  }, [busy, delayMs])
  return busy && shown
}
