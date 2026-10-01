import React, { useMemo, useState } from 'react'
import { Moon, Pause, Play, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { describeTeamMemberActivity } from './TeamAgentCard'
import { TeamVoicePanel } from './TeamVoicePanel'
import { TeamActivityList } from './team-activity-list'
import { isTeamBreakerPause, teamPauseReasonLabel } from './team-enum-labels'
import { buildTeamFeedRows, teamMailRows } from './team-feed-threads'
import { callTeamClosingTime, setTeamMemberCap, updateTeam } from './team-runtime-client'
import {
  formatUsd,
  type TeamLogMessage,
  type TeamMember,
  type TeamSnapshot
} from './team-snapshot-types'
import type { TeamActivity } from './use-team-activity'
import type { TeamAct } from './use-team-page-state'

function CapEditor({
  member,
  busy,
  onSave
}: {
  member: TeamMember
  busy: boolean
  onSave: (capUsd: number | null, tokenCap: number | null) => Promise<boolean>
}): React.JSX.Element {
  const [value, setValue] = useState(member.spend_cap_usd?.toString() ?? '')
  const [tokens, setTokens] = useState(member.token_cap?.toString() ?? '')
  const parsed = value.trim() === '' ? null : Number(value)
  const parsedTokens = tokens.trim() === '' ? null : Number(tokens)
  const valid =
    (parsed === null || (Number.isFinite(parsed) && parsed >= 0)) &&
    (parsedTokens === null || (Number.isInteger(parsedTokens) && parsedTokens > 0))
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        inputMode="decimal"
        placeholder={translate('team.orchestrator.noCap', 'No $ cap')}
        className="h-7 w-24"
      />
      <Input
        value={tokens}
        onChange={(event) => setTokens(event.target.value)}
        inputMode="numeric"
        placeholder={translate('team.orchestrator.noTokenCap', 'No token cap')}
        className="h-7 w-28"
      />
      <Button
        size="xs"
        variant="secondary"
        disabled={busy || !valid}
        onClick={() => void onSave(parsed, parsedTokens)}
      >
        {translate('team.orchestrator.setCap', 'Set cap')}
      </Button>
    </div>
  )
}

export function TeamOrchestratorPanel({
  target,
  snapshot,
  log,
  activity,
  busy,
  act
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  /** What the manager wrote, for reading it aloud. */
  log: readonly TeamLogMessage[]
  activity: TeamActivity
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const team = snapshot.team
  const manager = snapshot.members.find((member) => member.is_manager)
  const totalSpend = snapshot.members.reduce<number | null>(
    (sum, member) => (member.spend_usd === null ? sum : (sum ?? 0) + member.spend_usd),
    null
  )
  const tripped = snapshot.members.filter(
    (member) => member.paused_at && isTeamBreakerPause(member.pause_reason)
  )
  const managerId = manager?.id
  // Mail through the manager; with no manager yet, all of the team's mail.
  const routing = useMemo(
    () =>
      teamMailRows(
        buildTeamFeedRows(activity.entries),
        managerId ? { kind: 'member', memberId: managerId } : { kind: 'all' }
      ),
    [activity.entries, managerId]
  )
  const paused = team.status === 'paused'
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,1fr)_2fr] gap-4">
      <div className="scrollbar-sleek flex min-h-0 flex-col gap-4 overflow-y-auto">
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {translate('team.orchestrator.title', 'Orchestrator')}
          </div>
          {manager ? (
            <>
              <div className="text-[14px] font-semibold">{manager.display_name}</div>
              <p className="text-[13px]">{describeTeamMemberActivity(manager, undefined)}</p>
              <div className="text-[12px] text-muted-foreground">
                {translate('team.orchestrator.spendVsCap', 'Spend {{spend}} of cap {{cap}}', {
                  spend: formatUsd(manager.spend_usd),
                  cap: formatUsd(manager.spend_cap_usd)
                })}
              </div>
              <CapEditor
                key={manager.id}
                member={manager}
                busy={busy}
                onSave={(capUsd, tokenCap) =>
                  act(() =>
                    setTeamMemberCap(target, {
                      team: team.id,
                      member: manager.id,
                      capUsd,
                      tokenCap
                    })
                  )
                }
              />
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {translate(
                'team.orchestrator.noManager',
                'This team has no manager yet. Add a member and mark it as manager.'
              )}
            </p>
          )}
        </section>
        {manager ? (
          <TeamVoicePanel
            target={target}
            teamId={team.id}
            manager={manager}
            log={log}
            busy={busy}
            act={act}
          />
        ) : null}
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            <ShieldAlert className="size-3.5" />
            {translate('team.orchestrator.breaker', 'Breaker')}
          </div>
          <div className="text-[13px]">
            {translate('team.orchestrator.teamSpend', 'Team spend {{spend}}', {
              spend: formatUsd(totalSpend)
            })}
          </div>
          {tripped.length > 0 ? (
            tripped.map((member) => (
              <div key={member.id} className="text-[13px]">
                <span className="font-medium">{member.display_name}</span> ·{' '}
                {teamPauseReasonLabel(member.pause_reason)}
              </div>
            ))
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {translate('team.orchestrator.notTripped', 'No breaker has tripped.')}
            </p>
          )}
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
        </section>
      </div>
      <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4">
        <div className="pb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('team.orchestrator.routingLog', 'Routing log')}
        </div>
        <TeamActivityList
          rows={routing}
          members={snapshot.members}
          emptyLabel={
            activity.loaded ? translate('team.orchestrator.noRouting', 'No routing yet.') : null
          }
        />
      </section>
    </div>
  )
}
