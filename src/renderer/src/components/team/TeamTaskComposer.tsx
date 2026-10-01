import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { createTeamTask } from './team-runtime-client'
import type { TeamAct } from './use-team-page-state'

/**
 * Files one task on the board exactly as written. Work the manager should plan goes through
 * New goal instead, which is the only "ask the manager" flow.
 */
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
  const canSubmit = !busy && title.trim().length > 0
  const submit = (): void => {
    if (canSubmit) {
      void act(() => createTeamTask(target, { team: teamId, title })).then(
        (ok) => ok && setTitle('')
      )
    }
  }
  return (
    <div className="flex shrink-0 gap-1.5">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder={translate('team.tasks.newPlaceholder', 'New task…')}
      />
      <Button size="sm" variant="secondary" disabled={!canSubmit} onClick={submit}>
        <Plus />
        {translate('team.tasks.add', 'Add task')}
      </Button>
    </div>
  )
}
