import type {
  TeamDispatchWaitReason,
  TeamWorkWaitReason
} from '../../../shared/team-task-assignment'
import type { OrchestrationDb } from '../orchestration/db'
import type { TeamAssignedTask } from '../orchestration/db/teams/team-assigned-work-store'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { TaskRow } from '../orchestration/types'
import { requestDueTeamGoalReviews } from './team-goal-review'
import type { TeamMemberTurnLedger } from './team-member-turn-ledger'
import type { TeamMemberTurnState } from './team-member-turn-state'
import type { TeamTaskDispatchResult } from './team-task-dispatch'
import { noteTeamTaskStartFailure } from './team-task-start-retry'
import type { TeamWorkspaceFacts } from './team-workspace-facts'

const TICK_INTERVAL_MS = 3_000
// Folds a burst of status rows into one pass.
const WAKE_DELAY_MS = 250

export type TeamWorkSchedulerDeps = {
  getDb: () => OrchestrationDb
  turns: TeamMemberTurnLedger
  resolveLiveHandle: (member: TeamMemberRow) => string | null
  getTurnState: (handle: string) => Promise<TeamMemberTurnState>
  /** Why the task cannot start on the member yet, read without changing anything. */
  dispatchWait: (
    db: OrchestrationDb,
    team: TeamRow,
    task: TaskRow,
    member: TeamMemberRow
  ) => TeamDispatchWaitReason | null
  startDispatch: (
    db: OrchestrationDb,
    team: TeamRow,
    taskId: string,
    member: TeamMemberRow
  ) => Promise<TeamTaskDispatchResult>
  notifyMailbox: (mailbox: string) => void
  workspaceFacts: (team: TeamRow) => Promise<TeamWorkspaceFacts>
  now?: () => number
}

const waiting = (reason: TeamWorkWaitReason): TeamTaskDispatchResult => ({
  outcome: 'waiting',
  waiting: reason
})

/**
 * Starts each ready, assigned task on its member, and asks managers to review finished goals.
 * It is the only caller of a team start, for the tick and for `team task assign` alike, so "one
 * active dispatch per member" and "one prompt per idle edge" are each decided in one place.
 */
export class TeamWorkScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private wakeTimer: ReturnType<typeof setTimeout> | null = null
  // Set by stop(): an attempt already under way must not start a worker during quit.
  private stopped = false
  /** Members with an attempt under way, so two passes never try one member at once. */
  private readonly attempts = new Map<string, Promise<TeamTaskDispatchResult>>()
  /** Members whose start is in flight, by team: no Dispatch row names them until it attaches. */
  private readonly starting = new Map<string, string>()
  private readonly now: () => number

  constructor(private readonly deps: TeamWorkSchedulerDeps) {
    this.now = deps.now ?? (() => Date.now())
  }

  /** The ledger every loop that types into a member must share with this one. */
  get turns(): TeamMemberTurnLedger {
    return this.deps.turns
  }

  /** `intervalMs` covers what no status edge announces, such as a task settling. */
  start(intervalMs = TICK_INTERVAL_MS): void {
    if (this.timer) {
      return
    }
    this.stopped = false
    this.timer = setInterval(() => this.run(), intervalMs)
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

  /** One pass. Resolves once the starts it launched settle; the timer never waits on it. */
  async tick(): Promise<void> {
    const db = this.deps.getDb()
    const launched = this.launchStartable(db)
    await requestDueTeamGoalReviews({ db, workspaceFacts: this.deps.workspaceFacts })
    await Promise.all(launched)
  }

  /** Tries `taskId` on its assignee now and says what happened: the `team task assign` path. */
  considerNow(team: TeamRow, taskId: string, member: TeamMemberRow) {
    return this.attempt(this.deps.getDb(), team, taskId, member)
  }

  /** Why the member's assigned task has not started, for display; null while it is starting. */
  async explainWait(
    db: OrchestrationDb,
    team: TeamRow,
    member: TeamMemberRow,
    taskId: string
  ): Promise<TeamWorkWaitReason | null> {
    const blocked = this.gate(db, team, taskId, member)
    if (blocked) {
      return blocked === 'task_taken' ? null : blocked
    }
    if (this.attempts.has(member.id)) {
      return null
    }
    const state = await this.turnState(member)
    if (state === 'working') {
      return 'member_busy'
    }
    if (state === 'needs_human') {
      return 'member_needs_input'
    }
    return this.deps.turns.check(member.id, 'assignment') ? 'member_busy' : null
  }

  private run(): void {
    void this.tick().catch((error) => console.warn('[team-scheduler]', error))
  }

  /** The first startable task of each member, from one query; different members start together. */
  private launchStartable(db: OrchestrationDb): Promise<void>[] {
    const now = this.now()
    const launched: Promise<void>[] = []
    const tried = new Set<string>()
    for (const row of db.listStartableTeamTasks()) {
      const memberId = row.assignee_member_id
      if (this.stopped || tried.has(memberId) || this.attempts.has(memberId)) {
        continue
      }
      const team = db.getTeam(row.team_id)
      const member = db.getTeamMember(memberId)
      if (!team || !member || this.countDiedDispatch(db, team, member, row, now)) {
        continue
      }
      if (row.retry_at !== null && Date.parse(row.retry_at) > now) {
        continue
      }
      tried.add(memberId)
      launched.push(
        this.attempt(db, team, row.task_id, member).then(
          () => undefined,
          (error) => console.warn(`[team-scheduler] ${team.name}/${member.slug}:`, error)
        )
      )
    }
    return launched
  }

  /** A Dispatch that died after it started put its task back to ready: a failed start as well. */
  private countDiedDispatch(
    db: OrchestrationDb,
    team: TeamRow,
    member: TeamMemberRow,
    row: TeamAssignedTask,
    now: number
  ): boolean {
    const died =
      row.status === 'ready' &&
      row.last_dispatch_id !== null &&
      row.last_dispatch_id !== row.counted_dispatch_id &&
      (row.last_dispatch_status === 'failed' || row.last_dispatch_status === 'circuit_broken')
    if (died) {
      noteTeamTaskStartFailure({
        db,
        team,
        member,
        taskId: row.task_id,
        dispatchId: row.last_dispatch_id,
        error: row.last_dispatch_failure ?? 'The dispatch stopped before the task finished.',
        now,
        notifyMailbox: this.deps.notifyMailbox
      })
    }
    return died
  }

  private attempt(db: OrchestrationDb, team: TeamRow, taskId: string, member: TeamMemberRow) {
    if (this.attempts.has(member.id)) {
      return Promise.resolve(waiting('member_busy'))
    }
    const attempt = this.runAttempt(db, team, taskId, member).finally(() => {
      this.attempts.delete(member.id)
    })
    this.attempts.set(member.id, attempt)
    return attempt
  }

  private async runAttempt(
    db: OrchestrationDb,
    team: TeamRow,
    taskId: string,
    member: TeamMemberRow
  ): Promise<TeamTaskDispatchResult> {
    const blocked = this.gate(db, team, taskId, member)
    if (blocked) {
      return waiting(blocked)
    }
    const state = await this.turnState(member)
    if (state === 'working') {
      this.deps.turns.noteWorking(member.id)
      return waiting('member_busy')
    }
    if (state === 'needs_human') {
      return waiting('member_needs_input')
    }
    // `unknown` goes on: the start waits for the agent's idle prompt itself before it types.
    const current = { team: db.getTeam(team.id), member: db.getTeamMember(member.id) }
    if (this.stopped || !current.team || !current.member) {
      return waiting('team_inactive')
    }
    // Nothing is awaited from this re-check to the claim, so no other attempt slips in between.
    const recheck = this.gate(db, current.team, taskId, current.member)
    if (recheck) {
      return waiting(recheck)
    }
    const turn = this.deps.turns.claim(member.id, 'assignment')
    if (!turn.granted) {
      return waiting('member_busy')
    }
    this.starting.set(member.id, team.id)
    let result: TeamTaskDispatchResult
    try {
      result = await this.deps.startDispatch(db, current.team, taskId, current.member)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result = { outcome: 'failed', dispatchId: null, error: message, receipt: null }
    } finally {
      this.starting.delete(member.id)
    }
    if (result.outcome !== 'started') {
      this.deps.turns.release(turn.claim)
    }
    if (result.outcome === 'failed') {
      noteTeamTaskStartFailure({
        db,
        team: current.team,
        member: current.member,
        taskId,
        dispatchId: result.dispatchId,
        error: result.error,
        now: this.now(),
        notifyMailbox: this.deps.notifyMailbox
      })
    }
    return result
  }

  private async turnState(member: TeamMemberRow): Promise<TeamMemberTurnState> {
    const handle = this.deps.resolveLiveHandle(member)
    return handle ? this.deps.getTurnState(handle) : 'unknown'
  }

  /** Everything that can be decided without waiting; null when the task may start now. */
  private gate(
    db: OrchestrationDb,
    team: TeamRow,
    taskId: string,
    member: TeamMemberRow
  ): TeamWorkWaitReason | null {
    const task = db.getTask(taskId)
    const meta = db.getTeamTaskMeta(taskId)
    if (
      !task ||
      meta?.kind !== 'task' ||
      meta.assignee_member_id !== member.id ||
      task.status === 'dispatched' ||
      task.status === 'completed'
    ) {
      return 'task_taken'
    }
    if (meta.escalated_at) {
      return 'escalated'
    }
    if (meta.retry_at !== null && Date.parse(meta.retry_at) > this.now()) {
      return 'retry_backoff'
    }
    const wait = this.deps.dispatchWait(db, team, task, member)
    if (wait) {
      return wait
    }
    const busy = new Set(db.listTeamMemberIdsWithActiveDispatch(team.run_id))
    if (busy.has(member.id) || this.starting.has(member.id)) {
      return 'member_busy'
    }
    for (const [memberId, teamId] of this.starting) {
      if (teamId === team.id) {
        busy.add(memberId)
      }
    }
    return team.max_parallel !== null && busy.size >= team.max_parallel ? 'team_at_capacity' : null
  }
}
