import React from 'react'
import { translate } from '@/i18n/i18n'
import { parseSqliteUtc } from './team-board-lanes'
import type { TeamMissionRow } from './team-runtime-client'
import { useTeamClock } from './use-team-clock'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function formatTeamAutomationWhen(nextMs: number, now: number): string {
  const diff = nextMs - now
  if (diff <= 0) {
    return translate('team.auto.dueNow', 'due now')
  }
  const minutes = Math.ceil(diff / 60_000)
  if (minutes < 60) {
    return translate('team.auto.inMinutes', 'in {{count}} min', { count: minutes })
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return translate('team.auto.inHours', 'in {{count}} h', { count: hours })
  }
  return new Date(nextMs).toLocaleDateString()
}

function nextMission(
  missions: readonly TeamMissionRow[],
  now: number
): { mission: TeamMissionRow; at: number } | null {
  let best: { mission: TeamMissionRow; at: number } | null = null
  for (const mission of missions) {
    if (mission.enabled !== 1) {
      continue
    }
    const at = parseSqliteUtc(mission.next_run_at)
    if (at !== null && at >= now && (!best || at < best.at)) {
      best = { mission, at }
    }
  }
  return best
}

/** Live wall clock for the automations desk; the hands follow the host's local time. */
export function TeamAutomationClock({
  missions
}: {
  missions: readonly TeamMissionRow[]
}): React.JSX.Element {
  const now = useTeamClock(15_000)
  const date = new Date(now)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const time = `${pad(hours)}:${pad(minutes)}`
  const hourAngle = ((hours % 12) + minutes / 60) * 30
  const minuteAngle = minutes * 6
  const next = nextMission(missions, now)
  return (
    <section className="bureau-card flex items-center gap-3 p-3">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={translate('team.auto.clockLabel', 'Local time {{time}}', { time })}
        className="size-20 shrink-0"
      >
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="var(--bureau-paper-deep)"
          stroke="var(--bureau-ink)"
          strokeWidth="3"
        />
        {Array.from({ length: 12 }, (_, index) => (
          <line
            key={index}
            x1="50"
            y1="7"
            x2="50"
            y2="13"
            stroke="var(--bureau-rule)"
            strokeWidth={index % 3 === 0 ? 3 : 1.5}
            transform={`rotate(${index * 30} 50 50)`}
          />
        ))}
        <line
          x1="50"
          y1="54"
          x2="50"
          y2="28"
          stroke="var(--bureau-ink)"
          strokeWidth="5"
          strokeLinecap="square"
          transform={`rotate(${hourAngle} 50 50)`}
        />
        <line
          x1="50"
          y1="55"
          x2="50"
          y2="18"
          stroke="var(--bureau-ink)"
          strokeWidth="3"
          strokeLinecap="square"
          transform={`rotate(${minuteAngle} 50 50)`}
        />
        <circle
          cx="50"
          cy="50"
          r="3.5"
          fill="var(--bureau-accent)"
          stroke="var(--bureau-ink)"
          strokeWidth="1.5"
        />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="bureau-display text-bureau-ink-soft">
          {translate('team.auto.clock', 'Floor clock')}
        </div>
        <div className="text-[24px] font-semibold leading-tight tabular-nums">{time}</div>
        <div className="text-[12px] text-bureau-ink-soft">
          {date.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}
        </div>
        <div className="truncate pt-1 text-[11px] text-bureau-ink-soft">
          {next
            ? translate('team.auto.nextRun', 'Next: {{name}} · {{when}}', {
                name: next.mission.name,
                when: formatTeamAutomationWhen(next.at, now)
              })
            : translate('team.auto.noNextRun', 'No enabled mission is scheduled.')}
        </div>
      </div>
    </section>
  )
}
