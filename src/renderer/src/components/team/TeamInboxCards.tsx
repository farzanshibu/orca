import React, { useState } from 'react'
import { Check, FileImage, ListChecks, Send, SquareArrowOutUpRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { Portrait, memberLook } from './office-floor-sprite'
import { teamAgentLabel } from './team-agent-label'
import type { TeamAttentionItem } from './team-attention'
import { answerTeamQuestion, decideTeamHire, resolveTeamGate } from './team-runtime-client'
import type { TeamMember, TeamSnapshot } from './team-snapshot-types'
import { TeamMemberStatusChip, teamMemberStatus } from './team-member-status'
import type { TeamAct } from './use-team-page-state'

function parseGateOptions(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === 'string') : []
  } catch {
    return []
  }
}

function OwnerLine({
  owner,
  fallback,
  needsYou
}: {
  owner: TeamMember | undefined
  fallback: string
  needsYou: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      {owner ? (
        <Portrait look={memberLook(owner.slug, Boolean(owner.is_manager))} size={30} />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{owner?.display_name ?? fallback}</div>
        {owner ? (
          <div className="truncate text-[11px] text-bureau-ink-soft">{owner.role_slug}</div>
        ) : null}
      </div>
      {owner ? <TeamMemberStatusChip status={teamMemberStatus(owner, needsYou)} /> : null}
    </div>
  )
}

function FreeAnswer({
  busy,
  placeholder,
  submitLabel,
  onSubmit
}: {
  busy: boolean
  placeholder?: string
  submitLabel?: string
  onSubmit: (answer: string) => Promise<boolean>
}): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder={placeholder ?? translate('team.inbox.answerPlaceholder', 'Your answer…')}
        className="h-7 min-w-0 flex-1"
      />
      <Button
        size="xs"
        disabled={busy || !answer.trim()}
        onClick={() => void onSubmit(answer).then((ok) => ok && setAnswer(''))}
      >
        <Send />
        {submitLabel ?? translate('team.inbox.answer', 'Answer')}
      </Button>
    </div>
  )
}

function OptionTile({
  option,
  selected,
  answered,
  busy,
  onPick
}: {
  option: string
  selected: boolean
  answered: boolean
  busy: boolean
  onPick: (option: string) => void
}): React.JSX.Element {
  const fileLike = /\.[a-z0-9]{2,5}$/i.test(option)
  const Icon = fileLike ? FileImage : ListChecks
  return (
    <button
      type="button"
      data-selected={selected ? 'true' : undefined}
      disabled={busy}
      onClick={() => onPick(option)}
      className="bureau-option"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center border-2 border-bureau-ink bg-bureau-paper-deep">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{option}</span>
      </div>
      {answered && selected ? (
        <span className="bureau-chip self-start" data-tone="ok">
          <Check className="size-3" />
          {translate('team.inbox.youAnswered', 'You answered')}
        </span>
      ) : null}
    </button>
  )
}

function QuestionCard({
  item,
  owner,
  busy,
  onAnswer
}: {
  item: Extract<TeamAttentionItem, { kind: 'question' }>
  owner: TeamMember | undefined
  busy: boolean
  onAnswer: (body: string) => Promise<boolean>
}): React.JSX.Element {
  const { question } = item
  return (
    <div className="bureau-card space-y-2 p-3">
      <OwnerLine owner={owner} fallback={question.asker_handle} needsYou={false} />
      <div className="text-[14px] font-semibold">
        {question.subject || translate('team.inbox.question', 'The team has a question')}
      </div>
      {question.body && question.body !== question.subject ? (
        <p className="whitespace-pre-wrap text-[13px]">{question.body}</p>
      ) : null}
      <FreeAnswer busy={busy} onSubmit={onAnswer} />
    </div>
  )
}

function GateCard({
  item,
  owner,
  busy,
  onAnswer
}: {
  item: Extract<TeamAttentionItem, { kind: 'gate' }>
  owner: TeamMember | undefined
  busy: boolean
  onAnswer: (resolution: string) => Promise<boolean>
}): React.JSX.Element {
  const [choice, setChoice] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const options = parseGateOptions(item.gate.options)
  const pick = (option: string): void => {
    setChoice(option)
    setAnswered(true)
    void onAnswer(option).then((ok) => {
      if (!ok) {
        setAnswered(false)
      }
    })
  }
  return (
    <div className="bureau-card space-y-3 p-3">
      <OwnerLine owner={owner} fallback={item.gate.task_ref ?? ''} needsYou />
      <div className="text-[14px] font-semibold">{item.gate.question}</div>
      {options.length > 0 ? (
        <div className="grid gap-2 @xl/team-dock:grid-cols-2">
          {options.map((option) => (
            <OptionTile
              key={option}
              option={option}
              selected={choice === option}
              answered={answered}
              busy={busy}
              onPick={pick}
            />
          ))}
        </div>
      ) : null}
      <FreeAnswer
        busy={busy}
        placeholder={translate('team.inbox.orTypeAnswer', 'Or type an answer…')}
        onSubmit={onAnswer}
      />
    </div>
  )
}

/** One item waiting on the operator, rendered as the card its kind deserves. */
export function WaitingItem({
  item,
  target,
  snapshot,
  busy,
  act,
  onOpenRoom
}: {
  item: TeamAttentionItem
  target: RuntimeClientTarget
  snapshot: TeamSnapshot
  busy: boolean
  act: TeamAct
  onOpenRoom: (memberId: string) => void
}): React.JSX.Element {
  const team = snapshot.team.id
  const owner = snapshot.members.find((member) => member.id === item.memberId)
  if (item.kind === 'question') {
    return (
      <QuestionCard
        item={item}
        owner={owner}
        busy={busy}
        onAnswer={(body) =>
          act(
            () => answerTeamQuestion(target, { team, id: item.question.message_id, body }),
            item.id
          )
        }
      />
    )
  }
  if (item.kind === 'gate') {
    const ref =
      item.gate.task_ref ?? snapshot.tasks.find((task) => task.id === item.gate.task_id)?.ref
    return (
      <GateCard
        item={{ ...item, gate: { ...item.gate, task_ref: ref ?? item.gate.task_ref } }}
        owner={owner}
        busy={busy}
        onAnswer={(resolution) =>
          act(() => resolveTeamGate(target, { team, id: item.gate.id, resolution }), item.id)
        }
      />
    )
  }
  if (item.kind === 'permission') {
    const { member } = item
    return (
      <div className="bureau-card space-y-2 p-3">
        <OwnerLine owner={member} fallback={member.display_name} needsYou />
        <p className="text-[13px]">
          {translate('team.inbox.permission', 'Waiting at a permission prompt in its terminal.')}
        </p>
        <Button size="xs" variant="secondary" onClick={() => onOpenRoom(member.id)}>
          <SquareArrowOutUpRight />
          {translate('team.card.openRoom', 'Open room')}
        </Button>
      </div>
    )
  }
  const { hire } = item
  return (
    <div className="bureau-card space-y-2 p-3">
      <div className="text-[13px] font-semibold">
        {translate('team.inbox.hire', 'Hire proposal')}
      </div>
      <div className="text-[13px]">
        {hire.display_name} · {hire.role_slug} · {teamAgentLabel(hire.agent)}
        {hire.model ? ` · ${hire.model}` : ''}
      </div>
      {hire.rationale ? <p className="text-[12px] text-bureau-ink-soft">{hire.rationale}</p> : null}
      <div className="flex gap-1.5">
        <Button
          size="xs"
          disabled={busy}
          onClick={() =>
            void act(
              () => decideTeamHire(target, { team, id: hire.id, decision: 'approve', start: true }),
              item.id
            )
          }
        >
          <Check />
          {translate('team.inbox.approveStart', 'Approve and start')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void act(
              () => decideTeamHire(target, { team, id: hire.id, decision: 'reject' }),
              item.id
            )
          }
        >
          <X />
          {translate('team.inbox.reject', 'Reject')}
        </Button>
      </div>
    </div>
  )
}
