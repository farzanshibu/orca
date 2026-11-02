import React, { useState } from 'react'
import { Moon, Pause, Play, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { teamStatusLabel } from './team-enum-labels'
import { callTeamClosingTime, updateTeam } from './team-runtime-client'
import type { TeamSnapshot } from './team-snapshot-types'
import type { TeamAct } from './use-team-page-state'

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="bureau-card space-y-2 p-3">
      <h3 className="bureau-display text-bureau-ink-soft">{title}</h3>
      {children}
    </section>
  )
}

export function TeamSettingsPanel({
  target,
  snapshot,
  busy,
  act
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const team = snapshot.team
  const [charter, setCharter] = useState(team.charter)
  const paused = team.status === 'paused'
  const manager = snapshot.members.find((member) => member.is_manager)
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <Section title={translate('team.settings.identity', 'Identity')}>
        <div className="text-[14px] font-semibold">{team.name}</div>
        <p className="text-[12px] text-muted-foreground">
          {translate(
            'team.settings.nameLocked',
            'The host does not rename a team yet. Its task prefix is {{prefix}}.',
            { prefix: team.task_prefix }
          )}
        </p>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <span className="text-muted-foreground">
            {translate('team.settings.status', 'Status')}
          </span>
          <span>{teamStatusLabel(team.status)}</span>
          <span className="text-muted-foreground">
            {translate('team.settings.members', 'Members')}
          </span>
          <span>{snapshot.members.length}</span>
          <span className="text-muted-foreground">
            {translate('team.settings.manager', 'Manager')}
          </span>
          <span>{manager?.display_name ?? translate('team.settings.none', 'None yet')}</span>
        </div>
      </Section>
      <Section title={translate('team.settings.charterSection', 'Charter')}>
        <p className="text-[12px] text-muted-foreground">
          {translate(
            'team.settings.charterHint',
            'The standing brief every member of this team starts from.'
          )}
        </p>
        <Textarea
          value={charter}
          onChange={(event) => setCharter(event.target.value)}
          placeholder={translate('team.settings.charterPlaceholder', 'What this team is for')}
          className="min-h-32"
        />
        <Button
          size="sm"
          disabled={busy || charter.trim() === team.charter}
          onClick={() => void act(() => updateTeam(target, { team: team.id, charter }))}
        >
          <Save />
          {translate('team.settings.saveCharter', 'Save charter')}
        </Button>
      </Section>
      <Section title={translate('team.settings.running', 'Running')}>
        <p className="text-[12px] text-muted-foreground">
          {paused
            ? translate('team.settings.pausedHint', 'The team is paused and takes no new work.')
            : translate(
                'team.settings.activeHint',
                'The team is active. Pausing stops new work but keeps every member seated.'
              )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={paused ? 'default' : 'secondary'}
            disabled={busy}
            onClick={() =>
              void act(() =>
                updateTeam(target, { team: team.id, status: paused ? 'active' : 'paused' })
              )
            }
          >
            {paused ? <Play /> : <Pause />}
            {paused
              ? translate('team.orchestrator.resumeTeam', 'Resume the team')
              : translate('team.orchestrator.pauseTeam', 'Pause the team')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void act(() => callTeamClosingTime(target, team.id, Boolean(team.closing_at)))
            }
          >
            <Moon />
            {team.closing_at
              ? translate('team.orchestrator.cancelClosing', 'Call off closing time')
              : translate('team.orchestrator.closingTime', 'Closing time')}
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {translate(
            'team.settings.closingHint',
            'Closing time asks every member to wrap up and stop.'
          )}
        </p>
      </Section>
    </div>
  )
}
