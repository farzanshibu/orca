import { useEffect, useState } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { readTerminalPtyId } from './team-runtime-client'

/** The pty behind a member's live handle, or null until the host answers (or if it has none). */
export function useMemberPtyId(target: RuntimeClientTarget, handle: string | null): string | null {
  const [ptyId, setPtyId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!handle) {
      setPtyId(null)
      return
    }
    readTerminalPtyId(target, handle)
      .then((result) => !cancelled && setPtyId(result.terminal.ptyId))
      .catch(() => !cancelled && setPtyId(null))
    return () => {
      cancelled = true
    }
  }, [handle, target])
  return ptyId
}
