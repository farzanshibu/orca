import type { TeamMemberRow } from '../orchestration/team-types'

/**
 * `unverifiable` rather than stopped for a member meant to run whose terminal we cannot find:
 * after a restart or an SSH drop, absence here is not proof the agent stopped.
 */
export type TeamMemberLiveness = 'live' | 'unverifiable' | 'stopped'

export function teamMemberLiveness(
  member: Pick<TeamMemberRow, 'desired_state'>,
  liveHandle: string | null
): TeamMemberLiveness {
  if (liveHandle) {
    return 'live'
  }
  return member.desired_state === 'running' ? 'unverifiable' : 'stopped'
}
