import React, { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ListPlus, Send, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { AgentTerminalPreview } from '../dashboard-popout/AgentTerminalPreview'
import { TeamCapabilitiesEditor } from './TeamCapabilitiesEditor'
import { DictateButton } from './TeamVoicePanel'
import {
  queueTeamMessage,
  readTerminalPtyId,
  removeTeamQueueItem,
  reorderTeamQueue,
  sendToTeamMember
} from './team-runtime-client'
import type { TeamLogMessage, TeamMember } from './team-snapshot-types'

function useMemberPtyId(target: RuntimeClientTarget, handle: string | null): string | null {
  const [ptyId, setPtyId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!handle) {
      setPtyId(null)
      return
    }
    readTerminalPtyId(target, handle)
      .then((result) => !cancelled && setPtyId(result.terminal.ptyId))
      .catch(() => !cancelled && setPtyId(null))
    return () => {
      cancelled = true
    }
  }, [handle, target])
  return ptyId
}

function moved(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const next = [...ids]
  const [item] = next.splice(index, 1)
  next.splice(index + delta, 0, item)
  return next
}

export function TeamAgentRoom({
  target,
  teamId,
  member,
  log,
  act,
  onClose
}: {
  target: RuntimeClientTarget
  teamId: string
  member: TeamMember | null
  log: readonly TeamLogMessage[]
  act: (mutation: () => Promise<unknown>) => Promise<boolean>
  onClose: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
  const ptyId = useMemberPtyId(target, member?.live_handle ?? null)
  const handle = member?.live_handle ?? null
  const conversation = handle
    ? log.filter((message) => message.from_handle === handle || message.to_handle === handle)
    : []
  const queueIds = member?.queue.map((item) => item.id) ?? []

  async function submit(mode: 'now' | 'interrupt' | 'queue'): Promise<void> {
    if (!member || !draft.trim()) {
      return
    }
    const ok = await act(() =>
      mode === 'queue'
        ? queueTeamMessage(target, { team: teamId, member: member.id, text: draft })
        : sendToTeamMember(target, {
            team: teamId,
            member: member.id,
            text: draft,
            interrupt: mode === 'interrupt'
          })
    )
    if (ok) {
      setDraft('')
    }
  }

  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[80vh] max-w-6xl flex-col sm:max-w-6xl">
        <DialogTitle>{member?.display_name ?? ''}</DialogTitle>
        <DialogDescription>
          {member
            ? `${member.role_slug} · ${member.agent}${member.model ? ` · ${member.model}` : ''}`
            : ''}
        </DialogDescription>
        {member ? (
          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer text-[13px] font-medium">
              {translate('team.room.capabilities', 'Capabilities')}
            </summary>
            <div className="pt-2">
              <TeamCapabilitiesEditor
                key={member.id}
                target={target}
                teamId={teamId}
                member={member}
                act={act}
              />
            </div>
          </details>
        ) : null}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="scrollbar-sleek min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {conversation.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  {translate('team.room.empty', 'No team mail to or from this member yet.')}
                </p>
              ) : (
                conversation.toReversed().map((message) => (
                  <div key={message.id} className="space-y-0.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {message.from_handle === handle
                        ? translate('team.room.sent', 'Sent · {{type}}', { type: message.type })
                        : translate('team.room.received', 'Received · {{type}}', {
                            type: message.type
                          })}
                    </div>
                    <div className="text-[13px] font-medium">{message.subject}</div>
                    {message.body ? (
                      <div className="whitespace-pre-wrap text-[12px] text-muted-foreground">
                        {message.body}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {translate('team.room.queue', 'Queue · sent in order when the agent is idle')}
              </div>
              {member?.queue.length ? (
                member.queue.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">{item.text}</span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={translate('team.room.moveUp', 'Move up')}
                      onClick={() =>
                        void act(() =>
                          reorderTeamQueue(target, {
                            team: teamId,
                            member: member.id,
                            order: moved(queueIds, index, -1)
                          })
                        )
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={index === member.queue.length - 1}
                      aria-label={translate('team.room.moveDown', 'Move down')}
                      onClick={() =>
                        void act(() =>
                          reorderTeamQueue(target, {
                            team: teamId,
                            member: member.id,
                            order: moved(queueIds, index, 1)
                          })
                        )
                      }
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={translate('team.room.removeQueued', 'Remove from queue')}
                      onClick={() =>
                        void act(() => removeTeamQueueItem(target, { team: teamId, id: item.id }))
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="px-2 text-[12px] text-muted-foreground">
                  {translate('team.room.queueEmpty', 'Nothing queued.')}
                </p>
              )}
            </div>
            <Textarea
              ref={draftRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={translate('team.room.placeholder', 'Tell this agent something…')}
              className="min-h-20"
            />
            <div className="flex items-center gap-1.5">
              <DictateButton targetRef={draftRef} />
              <Button size="sm" onClick={() => void submit('now')} disabled={!handle}>
                <Send />
                {translate('team.room.sendNow', 'Send now')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void submit('queue')}>
                <ListPlus />
                {translate('team.room.queueIt', 'Queue')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void submit('interrupt')}
                disabled={!handle}
              >
                <Zap />
                {translate('team.room.interrupt', 'Interrupt and send')}
              </Button>
            </div>
          </div>
          <div className="min-h-0 overflow-hidden rounded-md border border-border bg-background">
            {ptyId ? (
              <AgentTerminalPreview ptyId={ptyId} className="h-full w-full" />
            ) : (
              <p className="p-3 text-[13px] text-muted-foreground">
                {translate('team.room.noTerminal', 'Start this member to see its live terminal.')}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
