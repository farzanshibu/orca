import React, { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { answerTeamQuestion, decideTeamHire, resolveTeamGate } from './team-runtime-client'
import {
  teamMemberForHandle,
  type TeamLogMessage,
  type TeamMember,
  type TeamSnapshot
} from './team-snapshot-types'

/** Mail Orca or an outside trigger wrote into the team, as opposed to members talking. */
export function isExternalTeamMessage(message: Pick<TeamLogMessage, 'from_handle'>): boolean {
  return message.from_handle.startsWith('orca:') || message.from_handle.startsWith('external:')
}

function parseGateOptions(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === 'string') : []
  } catch {
    return []
  }
}

function QueueHeading({ label, count }: { label: string; count: number }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 pb-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </span>
      <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
        {count}
      </span>
    </div>
  )
}

function AnswerRow({
  prompt,
  from,
  options,
  onAnswer
}: {
  prompt: string
  from: string
  options: string[]
  onAnswer: (answer: string) => Promise<boolean>
}): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="text-[12px] text-muted-foreground">{from}</div>
      <div className="whitespace-pre-wrap text-[13px]">{prompt}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => (
          <Button key={option} size="xs" variant="secondary" onClick={() => void onAnswer(option)}>
            {option}
          </Button>
        ))}
        <Input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={translate('team.inbox.answerPlaceholder', 'Your answer…')}
          className="h-7 min-w-0 flex-1"
        />
        <Button
          size="xs"
          disabled={!answer.trim()}
          onClick={() => void onAnswer(answer).then((ok) => ok && setAnswer(''))}
        >
          {translate('team.inbox.answer', 'Answer')}
        </Button>
      </div>
    </div>
  )
}

function LogRow({
  message,
  members
}: {
  message: TeamLogMessage
  members: readonly TeamMember[]
}): React.JSX.Element {
  const name = (handle: string) => teamMemberForHandle(members, handle)?.display_name ?? handle
  return (
    <div className="rounded-md px-2 py-1.5 hover:bg-accent">
      <div className="text-[12px] text-muted-foreground">
        {name(message.from_handle)} → {name(message.to_handle)} · {message.type}
      </div>
      <div className="text-[13px]">{message.subject}</div>
    </div>
  )
}

export function TeamInbox({
  target,
  snapshot,
  log,
  act
}: {
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  log: readonly TeamLogMessage[]
  act: (mutation: () => Promise<unknown>) => Promise<boolean>
}): React.JSX.Element {
  const team = snapshot.team.id
  const members = snapshot.members
  const waitingCount =
    snapshot.pendingQuestions.length + snapshot.pendingGates.length + snapshot.pendingHires.length
  const external = log.filter(isExternalTeamMessage)
  const chatter = log.filter((message) => !isExternalTeamMessage(message))
  const column = 'scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto'
  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 gap-4">
      <section className="flex min-h-0 flex-col">
        <QueueHeading
          label={translate('team.inbox.waiting', 'Waiting on you')}
          count={waitingCount}
        />
        <div className={column}>
          {snapshot.pendingQuestions.map((question) => (
            <AnswerRow
              key={question.message_id}
              from={
                teamMemberForHandle(members, question.asker_handle)?.display_name ??
                question.asker_handle
              }
              prompt={question.body || question.subject}
              options={[]}
              onAnswer={(body) =>
                act(() => answerTeamQuestion(target, { team, id: question.message_id, body }))
              }
            />
          ))}
          {snapshot.pendingGates.map((gate) => (
            <AnswerRow
              key={gate.id}
              from={translate('team.inbox.gate', 'Decision gate')}
              prompt={gate.question}
              options={parseGateOptions(gate.options)}
              onAnswer={(resolution) =>
                act(() => resolveTeamGate(target, { team, id: gate.id, resolution }))
              }
            />
          ))}
          {snapshot.pendingHires.map((hire) => (
            <div key={hire.id} className="space-y-2 rounded-md border border-border bg-card p-3">
              <div className="text-[12px] text-muted-foreground">
                {translate('team.inbox.hire', 'Hire proposal')}
              </div>
              <div className="text-[13px] font-medium">
                {hire.display_name} · {hire.role_slug} · {hire.agent}
                {hire.model ? ` · ${hire.model}` : ''}
              </div>
              {hire.rationale ? (
                <div className="text-[12px] text-muted-foreground">{hire.rationale}</div>
              ) : null}
              <div className="flex gap-1.5">
                <Button
                  size="xs"
                  onClick={() =>
                    void act(() =>
                      decideTeamHire(target, {
                        team,
                        id: hire.id,
                        decision: 'approve',
                        start: true
                      })
                    )
                  }
                >
                  <Check />
                  {translate('team.inbox.approveStart', 'Approve and start')}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    void act(() =>
                      decideTeamHire(target, { team, id: hire.id, decision: 'reject' })
                    )
                  }
                >
                  <X />
                  {translate('team.inbox.reject', 'Reject')}
                </Button>
              </div>
            </div>
          ))}
          {waitingCount === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {translate('team.inbox.nothingWaiting', 'Nothing is waiting on you.')}
            </p>
          ) : null}
        </div>
      </section>
      <section className="flex min-h-0 flex-col">
        <QueueHeading
          label={translate('team.inbox.chatter', 'Between agents')}
          count={chatter.length}
        />
        <div className={column}>
          {chatter.map((message) => (
            <LogRow key={message.id} message={message} members={members} />
          ))}
        </div>
      </section>
      <section className="flex min-h-0 flex-col">
        <QueueHeading
          label={translate('team.inbox.external', 'From outside')}
          count={external.length}
        />
        <div className={column}>
          {external.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {translate(
                'team.inbox.noExternal',
                'Nothing from automations, webhooks, or Orca yet.'
              )}
            </p>
          ) : (
            external.map((message) => (
              <LogRow key={message.id} message={message} members={members} />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
