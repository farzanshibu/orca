import { useEffect, useState } from 'react'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { ORCHESTRATION_TEAM_FANOUT_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { TeamFanoutSupport } from './team-goal-draft'

/**
 * Whether the host takes goals and assignments. The local host is this build; a paired one is
 * asked, and stays `unknown` while it has not answered, so its reply to the call itself decides.
 */
export function useTeamFanoutSupport(target: RuntimeClientTarget): TeamFanoutSupport {
  const environmentId = target.kind === 'environment' ? target.environmentId : null
  const [answer, setAnswer] = useState<{ environmentId: string; supported: boolean } | null>(null)
  useEffect(() => {
    if (environmentId === null) {
      return
    }
    let cancelled = false
    void runtimeEnvironmentSupportsCapability(
      environmentId,
      ORCHESTRATION_TEAM_FANOUT_RUNTIME_CAPABILITY
    )
      .then((supported) => {
        if (!cancelled) {
          setAnswer({ environmentId, supported })
        }
      })
      // A failed probe says nothing about the host; the page's own refresh reports the lost link.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [environmentId])
  if (environmentId === null) {
    return 'supported'
  }
  if (answer?.environmentId !== environmentId) {
    return 'unknown'
  }
  return answer.supported ? 'supported' : 'unsupported'
}
