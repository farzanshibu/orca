import type { OrchestrationDb } from '../orchestration/db'
import type { TeamQueueItem } from '../orchestration/db/teams/team-board-store'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import { isTeamClosingNote } from './team-closing-time'
import type { TeamMemberTurnLedger, TeamTurnKind } from './team-member-turn-ledger'
import type { TeamMemberTurnState } from './team-member-turn-state'

const BACKSTOP_INTERVAL_MS = 5_000
// Folds a burst of status rows into one pass and lets the agent finish painting its prompt.
const WAKE_DELAY_MS = 250

export type TeamQueueDispatcherDeps = {
  getDb: () => OrchestrationDb
  turns: TeamMemberTurnLedger
  resolveLiveHandle: (member: TeamMemberRow) => string | null
  getTurnState: (handle: string) => Promise<TeamMemberTurnState>
  sendPrompt: (handle: string, text: string) => Promise<void>
}

/**
 * The queued prompt the member gets next. While the team is closing that is only the wrap-up note:
 * anything typed after it would be work nobody told the agent to commit.
 */
export function nextTeamQueueItem(
  db: OrchestrationDb,
  team: TeamRow,
  memberId: string
): TeamQueueItem | undefined {
  const pending = db.listPendingTeamQueue(memberId)
  return team.closing_at ? pending.find(isTeamClosingNote) : pending[0]
}

function queueItemTurnKind(item: TeamQueueItem): TeamTurnKind {
  return isTeamClosingNote(item) ? 'closing' : 'queue'
}

/** The turn ledger's view of the queue: what, if anything, is waiting to be typed to the member. */
export function queuedTeamTurnKind(db: OrchestrationDb, memberId: string): TeamTurnKind | null {
  const member = db.getTeamMember(memberId)
  const team = member ? db.getTeam(member.team_id) : undefined
  const next = team ? nextTeamQueueItem(db, team, memberId) : undefined
  return next ? queueItemTurnKind(next) : null
}

/**
 * Sends each member the head of its queue once its agent is idle, one message per idle edge.
 * Why idle only: typing into a working agent interleaves with its turn; the operator who
 * needs that uses `team member send --interrupt` instead.
 */
export class TeamQueueDispatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private wakeTimer: ReturnType<typeof setTimeout> | null = null
  private ticking = false
  private rerun = false
  // Set by stop(): a pass already under way must not keep typing into terminals during quit.
  private stopped = false

  constructor(private readonly deps: TeamQueueDispatcherDeps) {}

  /** `backstopMs` only covers a status edge the hook store never reported; `wake` is the fast path. */
  start(backstopMs = BACKSTOP_INTERVAL_MS): void {
    if (this.timer) {
      return
    }
    this.stopped = false
    this.timer = setInterval(() => this.run(), backstopMs)
    this.timer.unref?.()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer)
      this.wakeTimer = null
    }
  }

  /** Asks for a pass soon, after a member's agent changed state. */
  wake(): void {
    if (!this.timer || this.wakeTimer) {
      return
    }
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null
      this.run()
    }, WAKE_DELAY_MS)
    this.wakeTimer.unref?.()
  }

  async tick(): Promise<void> {
    if (this.ticking) {
      // An edge that lands mid-pass may belong to a member the pass already visited.
      this.rerun = true
      return
    }
    this.ticking = true
    try {
      do {
        this.rerun = false
        await this.pass()
      } while (this.rerun)
    } finally {
      this.ticking = false
    }
  }

  private run(): void {
    void this.tick().catch((error) => console.warn('[team-queue]', error))
  }

  private async pass(): Promise<void> {
    const db = this.deps.getDb()
    for (const team of db.listTeams()) {
      if (team.status !== 'active') {
        continue
      }
      for (const member of db.listTeamMembers(team.id)) {
        if (this.stopped) {
          return
        }
        try {
          await this.deliverNext(db, team, member)
        } catch (error) {
          console.warn(`[team-queue] ${team.name}/${member.slug}:`, error)
        }
      }
    }
  }

  private async deliverNext(db: OrchestrationDb, team: TeamRow, member: TeamMemberRow) {
    if (member.paused_at || !nextTeamQueueItem(db, team, member.id)) {
      return
    }
    const handle = this.deps.resolveLiveHandle(member)
    if (!handle) {
      return
    }
    const state = await this.deps.getTurnState(handle)
    if (state === 'working') {
      this.deps.turns.noteWorking(member.id)
    }
    if (state !== 'idle') {
      return
    }
    // Re-read: the operator may have reordered or removed it while the status was being read.
    const next = nextTeamQueueItem(db, team, member.id)
    if (!next) {
      return
    }
    const turn = this.deps.turns.claim(member.id, queueItemTurnKind(next))
    if (!turn.granted) {
      return
    }
    try {
      await this.deps.sendPrompt(handle, next.text)
    } catch (error) {
      this.deps.turns.release(turn.claim)
      db.settleTeamQueueItem(next.id, {
        delivered: false,
        reason: error instanceof Error ? error.message : String(error)
      })
      return
    }
    db.settleTeamQueueItem(next.id, { delivered: true })
  }
}
