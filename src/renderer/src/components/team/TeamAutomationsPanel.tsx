import React, { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import {
  TEAM_MISSION_TEMPLATES,
  TEAM_TRIGGER_MODES,
  TeamMissionScheduleSchema,
  describeTeamMissionSchedule
} from '../../../../shared/team-mission-schedule'
import { teamTriggerModeLabel } from './team-enum-labels'
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
import type { TeamAct } from './use-team-page-state'

function scheduleLabel(raw: string): string {
  try {
    const parsed = TeamMissionScheduleSchema.safeParse(JSON.parse(raw))
    return parsed.success ? describeTeamMissionSchedule(parsed.data) : raw
  } catch {
    return raw
  }
}

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
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
      <section className="scrollbar-sleek flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4">
        <SectionTitle>{translate('team.auto.missions', 'Missions')}</SectionTitle>
        {missions.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {translate('team.auto.noMissions', 'No missions yet. Start from a template below.')}
          </p>
        ) : (
          missions.map((mission) => (
            <div
              key={mission.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            >
              <Switch
                checked={mission.enabled === 1}
                disabled={busy}
                onCheckedChange={(enabled) =>
                  run(() =>
                    setTeamMissionEnabled(target, { team: teamId, id: mission.id, enabled })
                  )
                }
                aria-label={translate('team.auto.toggle', 'Mission enabled')}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{mission.name}</div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {mission.target} · {scheduleLabel(mission.schedule)}
                </div>
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={busy}
                aria-label={translate('team.auto.remove', 'Remove mission')}
                onClick={() =>
                  run(() => removeTeamMission(target, { team: teamId, id: mission.id }))
                }
              >
                <Trash2 />
              </Button>
            </div>
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
        <div className="space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-3 gap-2">
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
              busy || !name.trim() || !prompt.trim() || !Number.isInteger(minutes) || minutes < 5
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
      </section>
      <section className="scrollbar-sleek flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4">
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
        <div className="space-y-1">
          <div className="text-[13px] font-medium">{translate('team.auto.webhook', 'Webhook')}</div>
          {triggers?.webhookUrl ? (
            <div className="space-y-1 text-[12px] text-muted-foreground">
              <div className="break-all font-mono">
                {translate('team.auto.webhookPost', 'POST {{url}}', { url: triggers.webhookUrl })}
              </div>
              <div className="break-all font-mono">
                {translate('team.auto.webhookAuth', 'Authorization: Bearer {{token}}', {
                  token: triggers.webhookToken
                })}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {translate('team.auto.webhookOff', 'Off. The webhook listens on this machine only.')}
            </p>
          )}
          <div className="flex gap-1.5">
            {triggers?.webhookUrl ? (
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
            {translate('team.auto.compact', 'Send /compact after this many tokens (Claude, Codex)')}
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
    </div>
  )
}
