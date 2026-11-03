import { z } from 'zod'

export const TeamMissionScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('interval'), minutes: z.number().int().min(5).max(10_080) }),
  /** Local wall-clock time on the host that runs the team. */
  z.object({
    kind: z.literal('daily'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour).')
  })
])
export type TeamMissionSchedule = z.infer<typeof TeamMissionScheduleSchema>

export const TEAM_TRIGGER_MODES = ['communication-only', 'allow-all', 'off'] as const
export type TeamTriggerMode = (typeof TEAM_TRIGGER_MODES)[number]

/** The first run strictly after `from`. */
export function nextTeamMissionRun(schedule: TeamMissionSchedule, from: Date): Date {
  if (schedule.kind === 'interval') {
    return new Date(from.getTime() + schedule.minutes * 60_000)
  }
  const [hours, minutes] = schedule.time.split(':').map(Number)
  const next = new Date(from)
  next.setHours(hours, minutes, 0, 0)
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

export function describeTeamMissionSchedule(schedule: TeamMissionSchedule): string {
  return schedule.kind === 'interval'
    ? `every ${schedule.minutes} min`
    : `daily at ${schedule.time}`
}

export type TeamMissionTemplate = {
  id: string
  name: string
  target: string
  prompt: string
  schedule: TeamMissionSchedule
}

export const TEAM_MISSION_TEMPLATES: readonly TeamMissionTemplate[] = [
  {
    id: 'standup',
    name: 'Daily standup',
    target: 'manager',
    schedule: { kind: 'daily', time: '09:00' },
    prompt:
      'Run the standup: ask every member for status with a message to @all, then update the board with what is done, doing, and blocked. Put questions for the human in a decision gate.'
  },
  {
    id: 'heartbeat',
    name: 'Hourly heartbeat',
    target: 'manager',
    schedule: { kind: 'interval', minutes: 60 },
    prompt:
      'Heartbeat: check the task board for stalled or blocked work, nudge the owners, and dispatch ready tasks to idle members.'
  },
  {
    id: 'condense-memory',
    name: 'Weekly memory condense',
    target: '@all',
    schedule: { kind: 'interval', minutes: 10_080 },
    prompt:
      'Condense your memory file: keep durable facts, decisions, and open threads; drop what is done or stale. Keep it under a page.'
  },
  {
    id: 'wrap-up',
    name: 'End-of-day wrap-up',
    target: 'manager',
    schedule: { kind: 'daily', time: '18:00' },
    prompt:
      'Wrap up the day: ask members to commit or park their work, summarize progress on the board, and list tomorrow’s first tasks.'
  }
]
