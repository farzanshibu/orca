import type { OrchestrationDb } from '../orchestration/db'
import { acceptTeamTrigger } from './team-trigger-intake'

/** Fires due team missions into their targets' queues. */
export class TeamMissionScheduler {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly getDb: () => OrchestrationDb,
    private readonly now: () => Date = () => new Date()
  ) {}

  start(intervalMs = 30_000): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => this.tick(), intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  tick(): void {
    const db = this.getDb()
    const now = this.now()
    for (const mission of db.listDueTeamMissions(now)) {
      // Advance first so a failing delivery is reported once per slot, not retried every tick.
      db.recordTeamMissionRun(mission.id, now)
      try {
        acceptTeamTrigger(db, db.requireTeam(mission.team_id), {
          source: `mission:${mission.name}`,
          text: mission.prompt,
          target: mission.target
        })
      } catch (error) {
        console.warn(`[team-missions] ${mission.name}:`, error)
      }
    }
  }
}
