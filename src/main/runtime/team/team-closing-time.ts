import type { TeamClosingWait, TeamClosingWaitReason } from '../../../shared/team-closing-wait'
import type { OrchestrationDb } from '../orchestration/db'
import type { TeamQueueItem } from '../orchestration/db/teams/team-board-store'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import { teamMemberLiveness } from './team-member-liveness'
import type { TeamMemberTurnState } from './team-member-turn-state'

export const CLOSING_TIME_MESSAGE =
  'CLOSING TIME: finish or park your current step, commit your work with a clear message (or note why not), update your memory file with where you stopped, then stop and wait.'

export const TEAM_CLOSING_QUEUE_SOURCE = 'closing'

/** Ticks a member must be seen idle and wrapped up before Orca stops it. */
const IDLE_TICKS_TO_STOP = 3

export type TeamClosingProbe = {
  resolveLiveHandle: (member: TeamMemberRow) => string | null
  getTurnState: (handle: string) => Promise<TeamMemberTurnState>
}

export type TeamClosingTimeDeps = TeamClosingProbe & {
  getDb: () => OrchestrationDb
  stopMember: (member: TeamMemberRow) => Promise<void>
}

export function isTeamClosingNote(item: TeamQueueItem): boolean {
  return item.source === TEAM_CLOSING_QUEUE_SOURCE
}

/** A paused member or team takes no prompts, so its wrap-up note would never be typed. */
function queueIsHeld(team: TeamRow, member: TeamMemberRow): boolean {
  return member.paused_at !== null || team.status !== 'active'
}

function pendingClosingNotes(db: OrchestrationDb, memberId: string): TeamQueueItem[] {
  return db.listPendingTeamQueue(memberId).filter(isTeamClosingNote)
}

function dropPendingClosingNotes(db: OrchestrationDb, memberId: string): void {
  for (const note of pendingClosingNotes(db, memberId)) {
    db.removeTeamQueueItem(note.id)
  }
}

/** Starts the wind-down: every running member is told to wrap up, then stopped once it goes quiet. */
export function beginTeamClosingTime(
  db: OrchestrationDb,
  team: TeamRow,
  isLive: (member: TeamMemberRow) => boolean
): number {
  db.setTeamClosing(team.id, true)
  const notified = db
    .listTeamMembers(team.id)
    .filter((member) => isLive(member) && !queueIsHeld(team, member))
  for (const member of notified) {
    if (pendingClosingNotes(db, member.id).length === 0) {
      db.enqueueTeamMemberMessage(
        member.id,
        CLOSING_TIME_MESSAGE,
        TEAM_CLOSING_QUEUE_SOURCE,
        'front'
      )
    }
  }
  return notified.length
}

/** Ends the wind-down, finished or cancelled; an untyped wrap-up note must not greet the next start. */
export function endTeamClosingTime(db: OrchestrationDb, team: TeamRow): void {
  db.setTeamClosing(team.id, false)
  for (const member of db.listTeamMembers(team.id)) {
    dropPendingClosingNotes(db, member.id)
  }
}

/** Why closing still waits on this member, or null once it is stopped. */
export async function teamClosingWaitReason(
  probe: TeamClosingProbe,
  db: OrchestrationDb,
  team: TeamRow,
  member: TeamMemberRow
): Promise<TeamClosingWaitReason | null> {
  const handle = probe.resolveLiveHandle(member)
  if (!handle) {
    // A terminal we cannot find may still be running; only a member Orca stopped is done.
    return teamMemberLiveness(member, handle) === 'unverifiable' ? 'unverifiable' : null
  }
  const state = await probe.getTurnState(handle)
  if (state === 'working') {
    return 'working'
  }
  if (state === 'needs_human') {
    return 'needs_human'
  }
  if (state === 'unknown') {
    return 'status_unknown'
  }
  return !queueIsHeld(team, member) && pendingClosingNotes(db, member.id).length > 0
    ? 'closing_note_queued'
    : 'stopping'
}

export async function listTeamClosingWaits(
  probe: TeamClosingProbe,
  db: OrchestrationDb,
  team: TeamRow
): Promise<TeamClosingWait[]> {
  const waits: TeamClosingWait[] = []
  for (const member of db.listTeamMembers(team.id)) {
    const reason = await teamClosingWaitReason(probe, db, team, member)
    if (reason) {
      waits.push({ member_id: member.id, reason })
    }
  }
  return waits
}

export class TeamClosingTime {
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  private readonly idleTicks = new Map<string, number>()

  constructor(private readonly deps: TeamClosingTimeDeps) {}

  start(intervalMs = 5_000): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => {
      void this.tick().catch((error) => console.warn('[team-closing-time]', error))
    }, intervalMs)
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
      const closing = db.listTeams().filter((candidate) => candidate.closing_at)
      if (closing.length === 0) {
        // A cancelled wind-down must not leave a head start for the next one.
        this.idleTicks.clear()
      }
      for (const team of closing) {
        try {
          await this.closeTeam(db, team)
        } catch (error) {
          console.warn(`[team-closing-time] ${team.name}:`, error)
        }
      }
    } finally {
      this.ticking = false
    }
  }

  private async closeTeam(db: OrchestrationDb, team: TeamRow): Promise<void> {
    let waiting = 0
    for (const member of db.listTeamMembers(team.id)) {
      if (await this.stillWaitingOn(db, team, member)) {
        waiting += 1
      }
    }
    if (waiting > 0) {
      return
    }
    endTeamClosingTime(db, team)
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

  private async stillWaitingOn(
    db: OrchestrationDb,
    team: TeamRow,
    member: TeamMemberRow
  ): Promise<boolean> {
    const reason = await teamClosingWaitReason(this.deps, db, team, member)
    if (reason !== 'stopping') {
      this.idleTicks.delete(member.id)
      return reason !== null
    }
    const ticks = (this.idleTicks.get(member.id) ?? 0) + 1
    if (ticks < IDLE_TICKS_TO_STOP) {
      this.idleTicks.set(member.id, ticks)
      return true
    }
    this.idleTicks.delete(member.id)
    try {
      await this.deps.stopMember(member)
    } catch (error) {
      console.warn(`[team-closing-time] could not stop ${member.slug}:`, error)
      return true
    }
    return false
  }
}
