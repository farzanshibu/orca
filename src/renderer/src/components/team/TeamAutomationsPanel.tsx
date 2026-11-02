import React, { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Webhook } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import {
  TEAM_MISSION_TEMPLATES,
  TEAM_TRIGGER_MODES
} from '../../../../shared/team-mission-schedule'
import { TeamAutomationClock } from './TeamAutomationClock'
import { TeamAutomationStatusTiles } from './TeamAutomationStatusTiles'
import { teamTriggerModeLabel } from './team-enum-labels'
import { TeamMissionCard } from './TeamMissionCard'
import {
  addTeamMission,
  listTeamMissions,
  readTeamTriggers,
  removeTeamMission,
  setTeamMissionEnabled,
  setTeamTriggers,
  type TeamMissionRow,
  type TeamTriggerSettings
} from './team-runtime-client'
import { useTeamClock } from './use-team-clock'
import type { TeamAct } from './use-team-page-state'

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
      {children}
    </div>
  )
}

export function TeamAutomationsPanel({
  target,
  teamId,
  busy,
  act
}: {
  target: RuntimeClientTarget
  teamId: string
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const [missions, setMissions] = useState<TeamMissionRow[]>([])
  const [triggers, setTriggers] = useState<TeamTriggerSettings | null>(null)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [missionTarget, setMissionTarget] = useState('manager')
  const [every, setEvery] = useState('60')
  const [compact, setCompact] = useState('')
  const now = useTeamClock(15_000)

  const reload = useCallback(async () => {
    const [list, settings] = await Promise.all([
      listTeamMissions(target, teamId),
      readTeamTriggers(target, teamId)
    ])
    setMissions(list.missions)
    setTriggers(settings)
    setCompact(settings.autoCompactTokens?.toString() ?? '')
  }, [target, teamId])

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [reload])

  const run = (mutation: () => Promise<unknown>) =>
    void act(async () => {
      await mutation()
      await reload()
    })

  const minutes = Number(every)
  const enabled = missions.filter((mission) => mission.enabled === 1).length
  const webhookOn = Boolean(triggers?.webhookUrl)
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="grid gap-3 @2xl/team-dock:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <TeamAutomationClock missions={missions} />
        <TeamAutomationStatusTiles
          enabled={enabled}
          total={missions.length}
          webhookOn={webhookOn}
          compactTokens={triggers?.autoCompactTokens ?? null}
        />
      </div>
      <div className="grid min-h-0 gap-3 @3xl/team-dock:grid-cols-2">
        <section className="flex min-h-0 flex-col gap-2">
          <SectionTitle>
            {translate('team.auto.missions', 'Missions')} · {missions.length}
          </SectionTitle>
          {missions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {translate('team.auto.noMissions', 'No missions yet. Start from a template below.')}
            </p>
          ) : (
            missions.map((mission) => (
              <TeamMissionCard
                key={mission.id}
                mission={mission}
                busy={busy}
                now={now}
                onToggle={(on) =>
                  run(() =>
                    setTeamMissionEnabled(target, { team: teamId, id: mission.id, enabled: on })
                  )
                }
                onRemove={() =>
                  run(() => removeTeamMission(target, { team: teamId, id: mission.id }))
                }
              />
            ))
          )}
          <div className="flex flex-wrap gap-1.5">
            {TEAM_MISSION_TEMPLATES.map((template) => (
              <Button
                key={template.id}
                size="xs"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    addTeamMission(target, {
                      team: teamId,
                      name: template.name,
                      target: template.target,
                      prompt: template.prompt,
                      schedule: template.schedule
                    })
                  )
                }
              >
                <Plus />
                {template.name}
              </Button>
            ))}
          </div>
        </section>
        <div className="flex min-h-0 flex-col gap-3">
          <section className="flex min-h-0 flex-col gap-3">
            <SectionTitle>{translate('team.auto.triggers', 'Outside triggers')}</SectionTitle>
            <div className="space-y-1">
              <Label htmlFor="team-trigger-mode">
                {translate('team.auto.mode', 'What outside triggers may do')}
              </Label>
              <Select
                value={triggers?.triggerMode ?? 'communication-only'}
                disabled={busy}
                onValueChange={(triggerMode) =>
                  run(() => setTeamTriggers(target, { team: teamId, triggerMode }))
                }
              >
                <SelectTrigger id="team-trigger-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_TRIGGER_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {teamTriggerModeLabel(mode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bureau-card space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Webhook className="size-4 text-bureau-ink-soft" />
                <span className="text-[13px] font-medium">
                  {translate('team.auto.webhook', 'Webhook')}
                </span>
                <span className="bureau-chip" data-tone={webhookOn ? 'ok' : 'warn'}>
                  {webhookOn
                    ? translate('team.auto.webhookOn', 'Listening')
                    : translate('team.auto.webhookOffChip', 'Off')}
                </span>
              </div>
              {triggers?.webhookUrl ? (
                <div className="space-y-1">
                  <div className="bureau-code break-all">
                    {translate('team.auto.webhookPost', 'POST {{url}}', {
                      url: triggers.webhookUrl
                    })}
                  </div>
                  <div className="bureau-code break-all">
                    {translate('team.auto.webhookAuth', 'Authorization: Bearer {{token}}', {
                      token: triggers.webhookToken
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  {translate(
                    'team.auto.webhookOff',
                    'Off. The webhook listens on this machine only.'
                  )}
                </p>
              )}
              <div className="flex gap-1.5">
                {webhookOn ? (
                  <>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(() => setTeamTriggers(target, { team: teamId, webhook: 'rotate' }))
                      }
                    >
                      <RefreshCw />
                      {translate('team.auto.rotate', 'Rotate token')}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(() => setTeamTriggers(target, { team: teamId, webhook: 'disable' }))
                      }
                    >
                      {translate('team.auto.disableWebhook', 'Turn off')}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(() => setTeamTriggers(target, { team: teamId, webhook: 'enable' }))
                    }
                  >
                    {translate('team.auto.enableWebhook', 'Turn on webhook')}
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="team-auto-compact">
                {translate(
                  'team.auto.compact',
                  'Send /compact after this many tokens (Claude, Codex)'
                )}
              </Label>
              <div className="flex gap-1.5">
                <Input
                  id="team-auto-compact"
                  value={compact}
                  onChange={(e) => setCompact(e.target.value)}
                  inputMode="numeric"
                  placeholder={translate('team.auto.compactOff', 'Off')}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      setTeamTriggers(target, {
                        team: teamId,
                        autoCompactTokens: compact.trim() ? Number(compact) : null
                      })
                    )
                  }
                >
                  {translate('team.auto.save', 'Save')}
                </Button>
              </div>
            </div>
          </section>
          <details className="bureau-card p-3">
            <summary className="bureau-display cursor-pointer text-bureau-ink-soft">
              {translate('team.auto.addMission', 'Add mission by hand')}
            </summary>
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={translate('team.auto.name', 'Mission name')}
                />
                <Input
                  value={missionTarget}
                  onChange={(e) => setMissionTarget(e.target.value)}
                  placeholder={translate('team.auto.target', 'manager, @all, or a slug')}
                />
                <Input
                  value={every}
                  onChange={(e) => setEvery(e.target.value)}
                  inputMode="numeric"
                  placeholder={translate('team.auto.every', 'Every N minutes')}
                />
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={translate('team.auto.prompt', 'What the target should do each time')}
              />
              <Button
                size="sm"
                disabled={
                  busy ||
                  !name.trim() ||
                  !prompt.trim() ||
                  !Number.isInteger(minutes) ||
                  minutes < 5
                }
                onClick={() =>
                  run(async () => {
                    await addTeamMission(target, {
                      team: teamId,
                      name,
                      target: missionTarget,
                      prompt,
                      schedule: { kind: 'interval', minutes }
                    })
                    setName('')
                    setPrompt('')
                  })
                }
              >
                <Plus />
                {translate('team.auto.add', 'Add mission')}
              </Button>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
