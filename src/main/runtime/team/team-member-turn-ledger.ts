/** What can take a member's next turn, highest priority first. */
export const TEAM_TURN_KINDS = ['closing', 'queue', 'assignment'] as const
export type TeamTurnKind = (typeof TEAM_TURN_KINDS)[number]

/** How long a claim stands with no working edge before the turn counts as free again. */
export const TEAM_TURN_GRACE_MS = 30_000

export type TeamTurnClaim = {
  readonly memberId: string
  readonly kind: TeamTurnKind
  readonly claimedAt: number
}

export type TeamTurnRefusal =
  /** Something was already typed on this idle edge. */
  | { reason: 'turn_taken'; holder: TeamTurnKind }
  /** A higher-priority prompt is queued for this member. */
  | { reason: 'outranked'; by: TeamTurnKind }

export type TeamTurnDecision =
  | { granted: true; claim: TeamTurnClaim }
  | ({ granted: false } & TeamTurnRefusal)

export type TeamMemberTurnLedgerDeps = {
  /** The highest-priority prompt already queued for the member, read from the durable queue. */
  queuedKind: (memberId: string) => TeamTurnKind | null
  now?: () => number
  graceMs?: number
}

/**
 * One typed prompt per idle edge, across everything that types into a member's agent.
 * A claim stands until the agent is seen working, the send fails, or the grace runs out — the
 * last because a turn shorter than the poll leaves no working edge to see.
 */
export class TeamMemberTurnLedger {
  private readonly claims = new Map<string, TeamTurnClaim>()
  private readonly now: () => number
  private readonly graceMs: number

  constructor(private readonly deps: TeamMemberTurnLedgerDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.graceMs = deps.graceMs ?? TEAM_TURN_GRACE_MS
  }

  /** Takes the member's next turn for `kind`, or says why it cannot have it. */
  claim(memberId: string, kind: TeamTurnKind): TeamTurnDecision {
    const refusal = this.check(memberId, kind)
    if (refusal) {
      return { granted: false, ...refusal }
    }
    const claim: TeamTurnClaim = { memberId, kind, claimedAt: this.now() }
    this.claims.set(memberId, claim)
    return { granted: true, claim }
  }

  /** Why `kind` could not take the member's turn right now, without taking it. */
  check(memberId: string, kind: TeamTurnKind): TeamTurnRefusal | null {
    const holder = this.holder(memberId)
    if (holder) {
      return { reason: 'turn_taken', holder: holder.kind }
    }
    const queued = this.deps.queuedKind(memberId)
    if (queued !== null && TEAM_TURN_KINDS.indexOf(queued) < TEAM_TURN_KINDS.indexOf(kind)) {
      return { reason: 'outranked', by: queued }
    }
    return null
  }

  /** The send failed, so this idle edge is still unspent. */
  release(claim: TeamTurnClaim): void {
    if (this.claims.get(claim.memberId) === claim) {
      this.claims.delete(claim.memberId)
    }
  }

  /** The member's agent was seen working: whatever was typed has been taken up. */
  noteWorking(memberId: string): void {
    this.claims.delete(memberId)
  }

  /** The claim still standing on the member's turn, if any. */
  holder(memberId: string): TeamTurnClaim | null {
    const claim = this.claims.get(memberId)
    if (!claim) {
      return null
    }
    if (this.now() - claim.claimedAt >= this.graceMs) {
      this.claims.delete(memberId)
      return null
    }
    return claim
  }
}
