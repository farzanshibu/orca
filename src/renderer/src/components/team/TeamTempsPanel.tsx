import React, { useState } from 'react'
import { DoorOpen, SquareArrowOutUpRight, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
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
import { AGENT_CATALOG } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { parseSqliteUtc } from './team-board-lanes'
import { teamTaskStatusLabel } from './team-enum-labels'
import { Portrait, memberLook } from './office-floor-sprite'
import { teamMemberLiveness } from './team-member-liveness'
import { addTeamMember, createTeamTask, runTeamMemberAction } from './team-runtime-client'
import { formatUsd, type TeamSnapshot } from './team-snapshot-types'
import {
  isTeamTemp,
  makeTeamTempSlug,
  TEAM_TEMP_ROLE,
  teamTempJob,
  teamTempJobTitle,
  teamTempPhase,
  teamTempProgress,
  type TeamTempPhase
} from './team-temps'
import { useTeamClock } from './use-team-clock'
import type { TeamAct } from './use-team-page-state'

function tempPhaseLabel(phase: TeamTempPhase): string {
  switch (phase) {
    case 'hired':
      return translate('team.temps.phase.hired', 'Hired, waiting for its job')
    case 'working':
      return translate('team.temps.phase.working', 'On the job')
    case 'paused':
      return translate('team.temps.phase.paused', 'Paused')
    case 'off':
      return translate('team.temps.phase.off', 'Out of office')
    case 'done':
      return translate('team.temps.phase.done', 'Job done')
    case 'failed':
      return translate('team.temps.phase.failed', 'Job failed')
  }
}

function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) {
    return translate('team.temps.minutes', '{{count}}m', { count: minutes })
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0
    ? translate('team.temps.hoursMinutes', '{{hours}}h {{minutes}}m', {
        hours,
        minutes: rest
      })
    : translate('team.temps.hours', '{{count}}h', { count: hours })
}

function TempDialog({
  open,
  onOpenChange,
  target,
  teamId,
  busy,
  act
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: RuntimeClientTarget
  teamId: string
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [job, setJob] = useState('')
  const [agent, setAgent] = useState('claude')
  const [model, setModel] = useState('')
  const valid = name.trim().length > 0 && job.trim().length > 0

  async function create(): Promise<void> {
    if (!valid) {
      return
    }
    const ok = await act(async () => {
      const { member } = await addTeamMember(target, teamId, {
        slug: makeTeamTempSlug(name),
        displayName: name.trim(),
        role: TEAM_TEMP_ROLE,
        brief: job.trim(),
        agent,
        model: model.trim() || undefined
      })
      await createTeamTask(target, {
        team: teamId,
        title: teamTempJobTitle(job),
        spec: job.trim(),
        assignee: member.id
      })
      await runTeamMemberAction(target, { team: teamId, member: member.id, action: 'Start' })
    }, 'temp-create')
    if (ok) {
      setName('')
      setJob('')
      setModel('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('team.temps.hireTitle', 'Hire a temp')}</DialogTitle>
          <DialogDescription>
            {translate(
              'team.temps.hireHint',
              'Give it one job. It starts, finishes that ticket, and leaves the floor on its own.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="team-temp-name">{translate('team.temps.name', 'Name')}</Label>
            <Input
              id="team-temp-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={translate('team.temps.namePlaceholder', 'Audit the migration')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="team-temp-agent">{translate('team.temps.agent', 'Agent')}</Label>
              <Select value={agent} onValueChange={setAgent}>
                <SelectTrigger id="team-temp-agent" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_CATALOG.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="team-temp-model">
                {translate('team.member.model', 'Model (optional)')}
              </Label>
              <Input
                id="team-temp-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="team-temp-job">{translate('team.temps.job', 'The one job')}</Label>
            <Textarea
              id="team-temp-job"
              value={job}
              onChange={(event) => setJob(event.target.value)}
              placeholder={translate(
                'team.temps.jobPlaceholder',
                'What should it finish before it goes?'
              )}
              className="min-h-20"
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={busy || !valid} onClick={() => void create()}>
            <DoorOpen />
            {translate('team.temps.hire', 'Hire temp')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TeamTempsPanel({
  target,
  snapshot,
  pendingActions,
  act,
  onOpenMember
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  pendingActions: readonly string[]
  act: TeamAct
  onOpenMember: (memberId: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const now = useTeamClock(60_000)
  const team = snapshot.team
  const temps = snapshot.members.filter(isTeamTemp)
  const busy = pendingActions.includes('temp-create') || pendingActions.includes('temp-retire')
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="bureau-display text-bureau-ink-soft">
          {translate('team.temps.title', 'On loan')} · {temps.length}
        </span>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
          <DoorOpen />
          {translate('team.temps.hireTitle', 'Hire a temp')}
        </Button>
      </div>
      {temps.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {translate(
            'team.temps.empty',
            'No temps on the floor. Hire one for a single job and it leaves when the job is done.'
          )}
        </p>
      ) : (
        temps.map((member) => {
          const job = teamTempJob(member, snapshot.tasks)
          const phase = teamTempPhase(member, job, teamMemberLiveness(member))
          const done = phase === 'done' || phase === 'failed'
          const percent = teamTempProgress(job)
          const started = parseSqliteUtc(job?.created_at ?? null)
          const elapsed = started !== null ? formatElapsed(now - started) : null
          return (
            <div
              key={member.id}
              data-done={done ? 'true' : undefined}
              className="bureau-card space-y-2 p-3 data-[done=true]:opacity-60"
            >
              <div className="flex items-start gap-2">
                <Portrait look={memberLook(member.slug, false)} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold">
                      {member.display_name}
                    </span>
                    <span className="bureau-chip">{translate('team.temps.badge', 'Temp')}</span>
                    <span className="text-[11px] text-bureau-ink-soft">
                      {tempPhaseLabel(phase)}
                    </span>
                  </div>
                  <div className="truncate text-[12px] text-bureau-ink-soft">
                    {job
                      ? `${job.ref ?? job.id} · ${job.task_title ?? job.spec.split('\n')[0]} · ${teamTaskStatusLabel(job.status)}`
                      : translate('team.temps.noJob', 'No ticket filed yet.')}
                  </div>
                </div>
                {elapsed ? (
                  <span className="shrink-0 text-[11px] text-bureau-ink-soft">
                    {translate('team.temps.elapsed', '{{time}} on the job', { time: elapsed })}
                  </span>
                ) : null}
              </div>
              <div
                className="bureau-gauge"
                data-tone={
                  phase === 'failed'
                    ? 'danger'
                    : phase === 'paused' || phase === 'off'
                      ? 'warn'
                      : 'ok'
                }
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={translate('team.temps.progress', 'Job progress')}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-bureau-ink-soft">
                <span>
                  {translate('team.card.tokens', '{{tokens}} tokens', {
                    tokens: (member.spend_tokens ?? 0).toLocaleString()
                  })}
                </span>
                <span>{formatUsd(member.spend_usd)}</span>
                <div className="flex-1" />
                <Button size="xs" variant="secondary" onClick={() => onOpenMember(member.id)}>
                  <SquareArrowOutUpRight />
                  {translate('team.temps.open', 'Open')}
                </Button>
                {done ? null : (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pendingActions.includes(member.id)}
                    onClick={() =>
                      void act(
                        () =>
                          runTeamMemberAction(target, {
                            team: team.id,
                            member: member.id,
                            action: 'Remove'
                          }),
                        member.id
                      )
                    }
                  >
                    <StopCircle />
                    {translate('team.temps.retire', 'Retire now')}
                  </Button>
                )}
              </div>
            </div>
          )
        })
      )}
      <p className="px-1 text-[12px] text-muted-foreground">
        {translate(
          'team.temps.autoRetire',
          'A temp leaves the floor as soon as every ticket it owns has finished.'
        )}
      </p>
      <TempDialog
        open={open}
        onOpenChange={setOpen}
        target={target}
        teamId={team.id}
        busy={busy}
        act={act}
      />
    </div>
  )
}
