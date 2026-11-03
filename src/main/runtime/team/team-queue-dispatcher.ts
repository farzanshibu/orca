import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow } from '../orchestration/team-types'

export type TeamQueueDispatcherDeps = {
  getDb: () => OrchestrationDb
  resolveLiveHandle: (member: TeamMemberRow) => string | null
  getAgentStatus: (handle: string) => string | null
  sendPrompt: (handle: string, text: string) => Promise<void>
}

/**
 * Sends each member the head of its operator queue once its agent is idle, one message per idle
 * edge. Why idle only: typing into a working agent interleaves with its turn; the operator who
 * needs that uses `team member send --interrupt` instead.
 */
export class TeamQueueDispatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  /** Members sent to on this idle edge; cleared once the agent is seen working again. */
  private readonly awaitingTurn = new Set<string>()

  constructor(private readonly deps: TeamQueueDispatcherDeps) {}

  start(intervalMs = 3_000): void {
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
        if (team.status !== 'active') {
          continue
        }
        for (const member of db.listTeamMembers(team.id)) {
          await this.deliverHead(db, member)
        }
      }
    } finally {
      this.ticking = false
    }
  }

  private async deliverHead(db: OrchestrationDb, member: TeamMemberRow): Promise<void> {
    const handle = this.deps.resolveLiveHandle(member)
    if (!handle || member.paused_at) {
      return
    }
    const status = this.deps.getAgentStatus(handle)
    if (status !== 'idle') {
      if (status !== null) {
        this.awaitingTurn.delete(member.id)
      }
      return
    }
    if (this.awaitingTurn.has(member.id)) {
      return
    }
    const [head] = db.listPendingTeamQueue(member.id)
    if (!head) {
      return
    }
    this.awaitingTurn.add(member.id)
    try {
      await this.deps.sendPrompt(handle, head.text)
      db.settleTeamQueueItem(head.id, { delivered: true })
    } catch (error) {
      db.settleTeamQueueItem(head.id, {
        delivered: false,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
