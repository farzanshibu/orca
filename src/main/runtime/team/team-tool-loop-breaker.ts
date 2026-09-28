import type { OrchestrationDb } from '../orchestration/db'
import { isEquivalentPaneKey } from '../orchestration/db/pane-key-match'
import type { TeamMemberRow } from '../orchestration/team-types'
import { tripTeamBreaker, type TeamBreakerEffects } from './team-breaker'

/** A repeat of the same call this many times inside the window is a loop, not persistence. */
const LOOP_REPEATS = 6
const WINDOW_MS = 5 * 60_000

type ToolEvent = { paneKey: string; toolName?: string; toolInput?: string }

/**
 * Watches hook tool events for team members and escalates a repeating call: first a steer
 * (a nudge typed into the agent to change approach), then — if it keeps looping — the breaker.
 */
export class TeamToolLoopBreaker {
  private readonly recent = new Map<string, { signature: string; at: number }[]>()
  private readonly steered = new Map<string, number>()

  constructor(
    private readonly getDb: () => OrchestrationDb,
    private readonly effects: TeamBreakerEffects & {
      /** Typed into the member's agent now; a looping agent may never go idle for the queue. */
      steerMember: (member: TeamMemberRow, text: string) => Promise<void>
    },
    private readonly now: () => number = () => Date.now()
  ) {}

  async observe(event: ToolEvent): Promise<void> {
    if (!event.toolName) {
      return
    }
    const db = this.getDb()
    const member = this.findMember(db, event.paneKey)
    if (!member || member.paused_at) {
      return
    }
    const now = this.now()
    const signature = `${event.toolName}\u0000${event.toolInput ?? ''}`
    const history = (this.recent.get(member.id) ?? []).filter((entry) => now - entry.at < WINDOW_MS)
    history.push({ signature, at: now })
    this.recent.set(member.id, history.slice(-LOOP_REPEATS * 2))
    const repeats = history.filter((entry) => entry.signature === signature).length
    if (repeats < LOOP_REPEATS) {
      return
    }
    this.recent.set(member.id, [])
    const steeredAt = this.steered.get(member.id)
    if (steeredAt === undefined || now - steeredAt > WINDOW_MS) {
      this.steered.set(member.id, now)
      await this.effects.steerMember(
        member,
        `Orca noticed you ran ${event.toolName} with the same input ${repeats} times. Stop, say what is blocking you, and try a different approach or ask for help.`
      )
      return
    }
    this.steered.delete(member.id)
    await tripTeamBreaker({
      db,
      effects: this.effects,
      team: db.requireTeam(member.team_id),
      member,
      reason: 'tool_loop',
      detail: `${event.toolName} repeated after a steer`
    })
  }

  private findMember(db: OrchestrationDb, paneKey: string): TeamMemberRow | undefined {
    for (const team of db.listTeams()) {
      const member = db
        .listTeamMembers(team.id)
        .find((candidate) => candidate.pane_key && isEquivalentPaneKey(candidate.pane_key, paneKey))
      if (member) {
        return member
      }
    }
    return undefined
  }
}
