import type { AutomationRunUsage } from '../../../shared/automations-types'
import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import { tripTeamBreaker } from './team-breaker'

// Agents whose TUI accepts a typed `/compact`.
const COMPACTABLE_AGENTS = new Set(['claude', 'codex'])

export type ProviderSessionUsageReader = {
  getProviderSessionUsage(
    sessions: readonly { sessionId: string; worktreeId: string | null }[]
  ): Promise<AutomationRunUsage[]>
}

export type TeamSpendMonitorDeps = {
  getDb: () => OrchestrationDb
  /** The provider sessions the hook server has seen in this pane. */
  getProviderSessionIds: (paneKey: string) => string[]
  /** Null for agents whose transcripts Orca does not price (every agent but Claude and Codex). */
  getUsageReader: (agent: string) => ProviderSessionUsageReader | null
  interruptMember: (member: TeamMemberRow) => Promise<void>
  notifyMailbox: (mailbox: string) => void
}

export function sumTeamMemberUsage(usages: readonly AutomationRunUsage[]): {
  usd: number | null
  tokens: number | null
} {
  const known = usages.filter((usage) => usage.status === 'known')
  const priced = known.filter((usage) => usage.estimatedCostUsd !== null)
  return {
    usd: priced.length > 0 ? priced.reduce((sum, u) => sum + (u.estimatedCostUsd ?? 0), 0) : null,
    tokens: known.length > 0 ? known.reduce((sum, u) => sum + (u.totalTokens ?? 0), 0) : null
  }
}

/**
 * Polls each member's spend from its provider transcripts and trips the breaker — pause, interrupt,
 * tell the manager — when a member crosses its cap. Spend is written to the database so every
 * reader (UI, CLI, mobile) sees the same number without re-scanning.
 */
export class TeamSpendMonitor {
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false

  constructor(private readonly deps: TeamSpendMonitorDeps) {}

  start(intervalMs = 60_000): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => void this.tick(), intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) {
      return
    }
    this.ticking = true
    try {
      const db = this.deps.getDb()
      for (const team of db.listTeams()) {
        for (const member of db.listTeamMembers(team.id)) {
          try {
            await this.refreshMember(db, team, member)
          } catch (error) {
            console.warn(`[team-spend] ${team.name}/${member.slug}:`, error)
          }
        }
      }
    } finally {
      this.ticking = false
    }
  }

  /** Context rule: queue `/compact` once a member has burned the team's token budget since its last one. */
  private maybeQueueCompact(
    db: OrchestrationDb,
    team: TeamRow,
    member: TeamMemberRow,
    tokens: number | null
  ): void {
    const threshold = team.auto_compact_tokens
    if (!threshold || tokens === null || !COMPACTABLE_AGENTS.has(member.agent)) {
      return
    }
    if (tokens - (member.compacted_at_tokens ?? 0) < threshold) {
      return
    }
    db.enqueueTeamMemberMessage(member.id, '/compact')
    db.markTeamMemberCompacted(member.id, tokens)
  }

  private async refreshMember(db: OrchestrationDb, team: TeamRow, member: TeamMemberRow) {
    if (member.pane_key) {
      for (const sessionId of this.deps.getProviderSessionIds(member.pane_key)) {
        db.recordTeamMemberSession({
          memberId: member.id,
          provider: member.agent,
          sessionId,
          worktreeId: member.worktree_id
        })
      }
    }
    const reader = this.deps.getUsageReader(member.agent)
    const sessions = db.listTeamMemberSessions(member.id)
    if (!reader || sessions.length === 0) {
      return
    }
    const spend = sumTeamMemberUsage(
      await reader.getProviderSessionUsage(
        sessions.map((session) => ({
          sessionId: session.session_id,
          worktreeId: session.worktree_id
        }))
      )
    )
    db.setTeamMemberSpend(member.id, spend)
    this.maybeQueueCompact(db, team, member, spend.tokens)
    const effects = {
      interruptMember: this.deps.interruptMember,
      notifyMailbox: this.deps.notifyMailbox
    }
    if (member.spend_cap_usd !== null && spend.usd !== null && spend.usd >= member.spend_cap_usd) {
      await tripTeamBreaker({
        db,
        effects,
        team,
        member,
        reason: 'spend_cap',
        detail: `$${spend.usd.toFixed(2)} of $${member.spend_cap_usd.toFixed(2)}`
      })
    } else if (
      member.token_cap !== null &&
      spend.tokens !== null &&
      spend.tokens >= member.token_cap
    ) {
      await tripTeamBreaker({
        db,
        effects,
        team,
        member,
        reason: 'token_cap',
        detail: `${spend.tokens.toLocaleString('en-US')} of ${member.token_cap.toLocaleString('en-US')} tokens`
      })
    }
  }
}
