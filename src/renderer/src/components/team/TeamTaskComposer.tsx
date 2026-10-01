import React, { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { createTeamTask } from './team-runtime-client'
import type { TeamAct } from './use-team-page-state'

/** File a task on the board as written, or hand a rough ask to the manager to turn into one. */
export function TeamTaskComposer({
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
  const [title, setTitle] = useState('')
  const submit = (enrich: boolean) =>
    void act(() => createTeamTask(target, { team: teamId, title, enrich })).then(
      (ok) => ok && setTitle('')
    )
  return (
    <div className="flex shrink-0 gap-1.5">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={translate('team.tasks.newPlaceholder', 'New task…')}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={busy || !title.trim()}
        onClick={() => submit(false)}
      >
        <Plus />
        {translate('team.tasks.add', 'Add task')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || !title.trim()}
        onClick={() => submit(true)}
      >
        <Sparkles />
        {translate('team.tasks.enrich', 'Ask manager to write it up')}
      </Button>
    </div>
  )
}
