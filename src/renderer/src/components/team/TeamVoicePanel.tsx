import React, { useEffect, useRef, useState } from 'react'
import { Mic, Send, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { dispatchDictationControl } from '../dictation/dictation-control-events'
import { sendToTeamMember } from './team-runtime-client'
import type { TeamLogMessage, TeamMember } from './team-snapshot-types'
import type { TeamAct } from './use-team-page-state'

/** Focuses the field, then toggles Orca's dictation, which types into the focused field. */
export function DictateButton({
  targetRef
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>
}): React.JSX.Element {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={translate('team.voice.dictate', 'Dictate')}
      onClick={() => {
        targetRef.current?.focus()
        dispatchDictationControl('toggle')
      }}
    >
      <Mic />
    </Button>
  )
}

function speak(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return
  }
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

/** Talk to the manager by voice and, optionally, hear its messages read aloud. */
export function TeamVoicePanel({
  target,
  teamId,
  manager,
  log,
  busy,
  act
}: {
  target: RuntimeClientTarget
  teamId: string
  manager: TeamMember
  log: readonly TeamLogMessage[]
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [readAloud, setReadAloud] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const spokenUpTo = useRef<number | null>(null)

  useEffect(() => {
    const fromManager = log.filter((message) => message.from_handle === manager.live_handle)
    const newest = fromManager[0]?.sequence ?? 0
    if (spokenUpTo.current === null || !readAloud) {
      // Arm at the current newest so turning this on never reads the backlog.
      spokenUpTo.current = newest
      return
    }
    for (const message of fromManager
      .filter((m) => m.sequence > (spokenUpTo.current ?? 0))
      .toReversed()) {
      speak(message.subject)
    }
    spokenUpTo.current = Math.max(spokenUpTo.current, newest)
  }, [log, manager.live_handle, readAloud])

  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {translate('team.voice.title', 'Talk to {{name}}', { name: manager.display_name })}
      </div>
      <Textarea
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={translate('team.voice.placeholder', 'Speak or type an instruction…')}
        className="min-h-16"
      />
      <div className="flex items-center gap-1.5">
        <DictateButton targetRef={inputRef} />
        <Button
          size="sm"
          disabled={busy || !draft.trim() || !manager.live_handle}
          onClick={() =>
            void act(() =>
              sendToTeamMember(target, { team: teamId, member: manager.id, text: draft })
            ).then((ok) => ok && setDraft(''))
          }
        >
          <Send />
          {translate('team.voice.send', 'Send')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setReadAloud((value) => !value)}>
          {readAloud ? <Volume2 /> : <VolumeX />}
          {readAloud
            ? translate('team.voice.readingAloud', 'Reading replies aloud')
            : translate('team.voice.readAloud', 'Read replies aloud')}
        </Button>
      </div>
    </section>
  )
}
