import type { TeamMember } from './team-snapshot-types'

/** The host's vocabulary: `stopped` is a member not meant to run, never a guess from silence. */
export type TeamMemberLiveness = 'live' | 'unverifiable' | 'stopped'

type LivenessFields = Pick<TeamMember, 'liveness' | 'live_handle' | 'desired_state'>

function isTeamMemberLiveness(value: string): value is TeamMemberLiveness {
  return value === 'live' || value === 'unverifiable' || value === 'stopped'
}

/**
 * Whether a member is running, as far as the host could tell. The host's own verdict wins; for a
 * value this build does not know, a member with no terminal is `stopped` only when the host says
 * it was told to stop. Anything else is `unverifiable`: a missing terminal is not proof it ended.
 */
export function teamMemberLiveness(member: LivenessFields): TeamMemberLiveness {
  if (isTeamMemberLiveness(member.liveness)) {
    return member.liveness
  }
  if (member.live_handle) {
    return 'live'
  }
  return member.desired_state === 'stopped' ? 'stopped' : 'unverifiable'
}
