import React from 'react'
import { Clock3, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import {
  TeamMissionScheduleSchema,
  describeTeamMissionSchedule
} from '../../../../shared/team-mission-schedule'
import { parseSqliteUtc } from './team-board-lanes'
import { formatTeamAutomationWhen } from './TeamAutomationClock'
import type { TeamMissionRow } from './team-runtime-client'

function scheduleLabel(raw: string): string {
  try {
    const parsed = TeamMissionScheduleSchema.safeParse(JSON.parse(raw))
    return parsed.success ? describeTeamMissionSchedule(parsed.data) : raw
  } catch {
    return raw
  }
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function formatStamp(raw: string | null): string | null {
  const ms = parseSqliteUtc(raw)
  if (ms === null) {
    return null
  }
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function TeamMissionCard({
  mission,
  busy,
  now,
  onToggle,
  onRemove
}: {
  mission: TeamMissionRow
  busy: boolean
  now: number
  onToggle: (enabled: boolean) => void
  onRemove: () => void
}): React.JSX.Element {
  const enabled = mission.enabled === 1
  const lastRun = formatStamp(mission.last_run_at)
  const nextRun = parseSqliteUtc(mission.next_run_at)
  return (
    <div className="bureau-card space-y-2 p-3">
      <div className="flex items-start gap-2">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-bureau-ink-soft" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold">{mission.name}</span>
            <span className="bureau-chip" data-tone={enabled ? 'ok' : undefined}>
              {enabled
                ? translate('team.auto.on', 'Scheduled')
                : translate('team.auto.off', 'Paused')}
            </span>
          </div>
          <div className="truncate text-[12px] text-bureau-ink-soft">
            {mission.target} · {scheduleLabel(mission.schedule)}
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          onCheckedChange={onToggle}
          aria-label={translate('team.auto.toggle', 'Mission enabled')}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-bureau-ink-soft">
        <div className="min-w-0">
          <div className="bureau-display">{translate('team.auto.lastRun', 'Last run')}</div>
          <div className="truncate tabular-nums">
            {lastRun ?? translate('team.auto.never', 'Never')}
          </div>
        </div>
        <div className="min-w-0">
          <div className="bureau-display">{translate('team.auto.nextRunLabel', 'Next run')}</div>
          <div className="truncate tabular-nums">
            {enabled && nextRun !== null
              ? formatTeamAutomationWhen(nextRun, now)
              : translate('team.auto.notScheduled', 'Not scheduled')}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={onRemove}
          aria-label={translate('team.auto.remove', 'Remove mission')}
        >
          <Trash2 />
          {translate('team.auto.removeShort', 'Remove')}
        </Button>
      </div>
    </div>
  )
}
