import type { OrchestrationDb } from '../orchestration/db'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'

export const CLOSING_TIME_MESSAGE =
  'CLOSING TIME: finish or park your current step, commit your work with a clear message (or note why not), update your memory file with where you stopped, then stop and wait.'

/** Ticks a member must be seen idle, with nothing queued, before Orca stops it. */
const IDLE_TICKS_TO_STOP = 3

export type TeamClosingTimeDeps = {
  getDb: () => OrchestrationDb
  resolveLiveHandle: (member: TeamMemberRow) => string | null
  getAgentStatus: (handle: string) => Promise<string | null>
  stopMember: (member: TeamMemberRow) => Promise<void>
}

/** Starts the wind-down: every running member is told to wrap up, then stopped once it goes quiet. */
export function beginTeamClosingTime(
  db: OrchestrationDb,
  team: TeamRow,
  isLive: (member: TeamMemberRow) => boolean
): number {
  db.setTeamClosing(team.id, true)
  const running = db.listTeamMembers(team.id).filter(isLive)
  for (const member of running) {
    db.enqueueTeamMemberMessage(member.id, CLOSING_TIME_MESSAGE, 'closing')
  }
  return running.length
}

export class TeamClosingTime {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly idleTicks = new Map<string, number>()

  constructor(private readonly deps: TeamClosingTimeDeps) {}

  start(intervalMs = 5_000): void {
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
    const db = this.deps.getDb()
    for (const team of db.listTeams().filter((candidate) => candidate.closing_at)) {
      let running = 0
      for (const member of db.listTeamMembers(team.id)) {
        const handle = this.deps.resolveLiveHandle(member)
        if (!handle) {
          this.idleTicks.delete(member.id)
          continue
        }
        running += 1
        const quiet =
          db.listPendingTeamQueue(member.id).length === 0 &&
          (await this.deps.getAgentStatus(handle)) === 'idle'
        const ticks = quiet ? (this.idleTicks.get(member.id) ?? 0) + 1 : 0
        this.idleTicks.set(member.id, ticks)
        if (ticks >= IDLE_TICKS_TO_STOP) {
          this.idleTicks.delete(member.id)
          await this.deps.stopMember(member)
          running -= 1
        }
      }
      if (running === 0) {
        db.setTeamClosing(team.id, false)
        db.updateTeam(team.id, { status: 'paused' })
        db.insertMessage({
          from: 'orca:closing-time',
          to: `run:${team.run_id}`,
          subject: 'Closing time complete: every member stopped and the team is paused.',
          body: '',
          type: 'status',
          runId: team.run_id
        })
      }
    }
  }
}
