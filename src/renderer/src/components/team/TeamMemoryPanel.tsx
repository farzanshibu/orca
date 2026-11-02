import React, { useCallback, useEffect, useState } from 'react'
import { Save, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
import type { TeamMember } from './team-snapshot-types'
import type { TeamAct } from './use-team-page-state'

type MemoryFilter = 'all' | 'tickets' | 'agents' | 'notes'

function isMemoryFilter(value: string): value is MemoryFilter {
  return value === 'all' || value === 'tickets' || value === 'agents' || value === 'notes'
}

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
    <div className="bureau-card flex min-h-28 min-w-0 flex-col p-2">
      <div className="pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-bureau-ink-soft">
        {label} · {hits.length}
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 space-y-1 overflow-y-auto">
        {hits.length === 0 ? (
          <p className="px-1 text-[12px] text-bureau-ink-soft">
            {translate('team.memory.noMatches', 'Nothing matches.')}
          </p>
        ) : (
          hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => onPick(hit)}
              className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-bureau-accent-soft"
            >
              <div className="truncate text-[13px] font-medium">{hit.title}</div>
              {hit.snippet ? (
                <div className="line-clamp-2 text-[12px] text-bureau-ink-soft">{hit.snippet}</div>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export function TeamMemoryPanel({
  target,
  teamId,
  members,
  busy,
  act
}: {
  target: RuntimeClientTarget
  teamId: string
  members: readonly TeamMember[]
  busy: boolean
  act: TeamAct
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MemoryFilter>('all')
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

  const hits = [...(result?.tickets ?? []), ...(result?.agents ?? []), ...(result?.notes ?? [])]
  const highlighted = new Set(hits.filter((hit) => hit.score > 0).map((hit) => hit.id))
  const pickNote = (hit: TeamMemoryHit) => {
    if (hit.id.startsWith('note:')) {
      void openNote(hit.id.slice('note:'.length))
    }
  }
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <form
        className="flex flex-wrap items-center justify-end gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          void act(() => search(query))
        }}
      >
        <span className="mr-auto text-[12px] text-bureau-ink-soft">
          {translate('team.memory.subtitle', 'What the floor knows, by topic and agent.')}
        </span>
        <Select
          value={filter}
          onValueChange={(value) => {
            if (isMemoryFilter(value)) {
              setFilter(value)
            }
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-28"
            aria-label={translate('team.memory.filter', 'Filter')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate('team.memory.all', 'Everything')}</SelectItem>
            <SelectItem value="tickets">{translate('team.memory.tickets', 'Tickets')}</SelectItem>
            <SelectItem value="agents">{translate('team.memory.agents', 'Agents')}</SelectItem>
            <SelectItem value="notes">{translate('team.memory.notes', 'Notes')}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={translate('team.memory.search', 'Search tickets, agents, and notes')}
          placeholder={translate('team.memory.search', 'Search tickets, agents, and notes')}
          className="h-8 w-full max-w-64"
        />
        <Button
          type="submit"
          size="icon-sm"
          variant="secondary"
          disabled={busy}
          aria-label={translate('team.memory.searchButton', 'Search')}
        >
          <Search />
        </Button>
      </form>
      <div className="relative h-[420px] shrink-0 overflow-hidden rounded-sm border-2 border-bureau-ink bg-bureau-paper-deep">
        {result ? (
          <TeamMemoryGraph graph={result.graph} highlighted={highlighted} members={members} />
        ) : (
          <p className="p-4 text-[13px] text-bureau-ink-soft">
            {translate('team.memory.loading', 'Reading the floor’s notes…')}
          </p>
        )}
        <span className="bureau-chip absolute right-2 top-2">
          {translate('team.memory.matches', '{{count}} matches', { count: highlighted.size })}
        </span>
      </div>
      <div className="grid gap-2 @xl/team-dock:grid-cols-3">
        {filter === 'all' || filter === 'tickets' ? (
          <HitColumn
            label={translate('team.memory.tickets', 'Tickets')}
            hits={result?.tickets ?? []}
            onPick={pickNote}
          />
        ) : null}
        {filter === 'all' || filter === 'agents' ? (
          <HitColumn
            label={translate('team.memory.agents', 'Agents')}
            hits={result?.agents ?? []}
            onPick={pickNote}
          />
        ) : null}
        {filter === 'all' || filter === 'notes' ? (
          <HitColumn
            label={translate('team.memory.notes', 'Notes')}
            hits={result?.notes ?? []}
            onPick={pickNote}
          />
        ) : null}
      </div>
      <details className="bureau-card p-3">
        <summary className="cursor-pointer text-[13px] font-medium">
          {translate('team.memory.editing', 'Editing {{note}}', { note })}
        </summary>
        <div className="space-y-2 pt-2">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            aria-label={translate('team.memory.noteBody', 'Note body')}
            className="min-h-40"
          />
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void act(() => writeTeamNote(target, { team: teamId, note, content }))}
          >
            <Save />
            {translate('team.memory.save', 'Save note')}
          </Button>
        </div>
      </details>
    </div>
  )
}
