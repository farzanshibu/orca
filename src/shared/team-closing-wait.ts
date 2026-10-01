/**
 * Why Closing Time is still waiting on a member:
 * `working` (mid-turn), `needs_human` (stuck on a prompt only the operator can answer),
 * `closing_note_queued` (idle, the wrap-up note not typed yet), `stopping` (idle and wrapped up;
 * Orca stops it after a short quiet period), `status_unknown` (its terminal runs but the agent's
 * state cannot be read), and `unverifiable` (meant to be running, terminal not found — it may
 * still be running, so it is never counted as stopped).
 */
export const TEAM_CLOSING_WAIT_REASONS = [
  'working',
  'needs_human',
  'closing_note_queued',
  'stopping',
  'status_unknown',
  'unverifiable'
] as const
export type TeamClosingWaitReason = (typeof TEAM_CLOSING_WAIT_REASONS)[number]

/** One entry of the snapshot's `closing.waiting_on`. */
export type TeamClosingWait = { member_id: string; reason: TeamClosingWaitReason }
