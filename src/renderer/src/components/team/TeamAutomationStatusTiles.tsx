import React from 'react'
import { CalendarClock, Gauge, Webhook } from 'lucide-react'
import { translate } from '@/i18n/i18n'

function StatusTile({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: 'ok' | 'warn'
}): React.JSX.Element {
  return (
    <div className="bureau-card flex flex-col gap-1 p-2.5">
      <div className="flex items-center gap-1.5 text-bureau-ink-soft">
        {icon}
        <span className="bureau-display">{label}</span>
      </div>
      <span className="truncate text-[15px] font-semibold">
        {tone ? (
          <span className="bureau-chip" data-tone={tone}>
            {value}
          </span>
        ) : (
          value
        )}
      </span>
    </div>
  )
}

export function TeamAutomationStatusTiles({
  enabled,
  total,
  webhookOn,
  compactTokens
}: {
  enabled: number
  total: number
  webhookOn: boolean
  compactTokens: number | null
}): React.JSX.Element {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <StatusTile
        icon={<CalendarClock className="size-3.5" />}
        label={translate('team.auto.tileScheduled', 'Scheduled')}
        value={translate('team.auto.tileMissions', '{{enabled}} of {{total}}', { enabled, total })}
      />
      <StatusTile
        icon={<Webhook className="size-3.5" />}
        label={translate('team.auto.tileWebhook', 'Webhook')}
        value={
          webhookOn
            ? translate('team.auto.webhookOn', 'Listening')
            : translate('team.auto.tileOff', 'Off')
        }
        tone={webhookOn ? 'ok' : 'warn'}
      />
      <StatusTile
        icon={<Gauge className="size-3.5" />}
        label={translate('team.auto.tileContext', 'Context')}
        value={
          compactTokens
            ? translate('team.auto.tileCompact', '/compact at {{tokens}}', {
                tokens: compactTokens.toLocaleString()
              })
            : translate('team.auto.tileOff', 'Off')
        }
      />
    </div>
  )
}
