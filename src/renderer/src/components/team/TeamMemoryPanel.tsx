import React, { useCallback, useEffect, useState } from 'react'
import { Save, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import { TeamMemoryGraph } from './TeamMemoryGraph'
import {
  readTeamNote,
  searchTeamMemory,
  writeTeamNote,
  type TeamMemoryHit,
  type TeamMemoryResult
} from './team-runtime-client'
import type { TeamAct } from './use-team-page-state'

function HitColumn({
  label,
  hits,
  onPick
}: {
  label: string
  hits: TeamMemoryHit[]
  onPick: (hit: TeamMemoryHit) => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {label} · {hits.length}
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 space-y-1 overflow-y-auto">
        {hits.map((hit) => (
          <button
            key={hit.id}
            type="button"
            onClick={() => onPick(hit)}
            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
          >
            <div className="truncate text-[13px] font-medium">{hit.title}</div>
            {hit.snippet ? (
              <div className="line-clamp-2 text-[12px] text-muted-foreground">{hit.snippet}</div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TeamMemoryPanel({
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
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<TeamMemoryResult | null>(null)
  const [note, setNote] = useState('board')
  const [content, setContent] = useState('')

  const search = useCallback(
    async (text: string) => setResult(await searchTeamMemory(target, teamId, text)),
    [target, teamId]
  )
  const openNote = useCallback(
    async (name: string) => {
      const read = await readTeamNote(target, teamId, name)
      setNote(name)
      setContent(read.content ?? '')
    },
    [target, teamId]
  )

  useEffect(() => {
    void search('').catch(() => undefined)
    void openNote('board').catch(() => undefined)
  }, [openNote, search])

  const highlighted = new Set(
    [...(result?.tickets ?? []), ...(result?.agents ?? []), ...(result?.notes ?? [])]
      .filter((hit) => hit.score > 0)
      .map((hit) => hit.id)
  )
  const pickNote = (hit: TeamMemoryHit) => {
    if (hit.id.startsWith('note:')) {
      void openNote(hit.id.slice('note:'.length))
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-4">
      <div className="flex min-h-0 flex-col gap-3">
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void act(() => search(query))
          }}
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('team.memory.search', 'Search tickets, agents, and notes')}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={busy}>
            <Search />
            {translate('team.memory.searchButton', 'Search')}
          </Button>
        </form>
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
          <HitColumn
            label={translate('team.memory.tickets', 'Tickets')}
            hits={result?.tickets ?? []}
            onPick={pickNote}
          />
          <HitColumn
            label={translate('team.memory.agents', 'Agents')}
            hits={result?.agents ?? []}
            onPick={pickNote}
          />
          <HitColumn
            label={translate('team.memory.notes', 'Notes')}
            hits={result?.notes ?? []}
            onPick={pickNote}
          />
        </div>
        <div className="h-72 shrink-0 rounded-xl border border-border bg-card">
          {result ? <TeamMemoryGraph graph={result.graph} highlighted={highlighted} /> : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('team.memory.editing', 'Editing {{note}}', { note })}
        </div>
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-0 flex-1 resize-none"
        />
        <Button
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => void act(() => writeTeamNote(target, { team: teamId, note, content }))}
        >
          <Save />
          {translate('team.memory.save', 'Save note')}
        </Button>
      </div>
    </div>
  )
}
