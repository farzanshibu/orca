import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CommandHandler } from '../../dispatch'
import { getOptionalNumberFlag, getOptionalStringFlag, getRequiredStringFlag } from '../../flags'
import { printResult } from '../../format'
import { teamParams } from './team-cli-format'

type MemoryHit = { id: string; title: string; snippet: string }

export const TEAM_MEMORY_HANDLERS: Record<string, CommandHandler> = {
  'team memory': async ({ flags, client, json }) => {
    const result = await client.call<{
      tickets: MemoryHit[]
      agents: MemoryHit[]
      notes: MemoryHit[]
    }>('orchestration.teamMemory', {
      ...teamParams(flags),
      query: getOptionalStringFlag(flags, 'query'),
      limit: getOptionalNumberFlag(flags, 'limit')
    })
    printResult(result, json, (value) =>
      (
        [
          ['Tickets', value.tickets],
          ['Agents', value.agents],
          ['Notes', value.notes]
        ] as const
      )
        .map(
          ([label, hits]) =>
            `${label}:\n${hits.length === 0 ? '  (none)' : hits.map((hit) => `  ${hit.title}${hit.snippet ? ` — ${hit.snippet}` : ''}`).join('\n')}`
        )
        .join('\n')
    )
  },

  'team note read': async ({ flags, client, json }) => {
    const result = await client.call<{ content: string | null; path: string }>(
      'orchestration.teamNoteRead',
      { ...teamParams(flags), note: getRequiredStringFlag(flags, 'note') }
    )
    printResult(result, json, (value) => value.content ?? `(empty: ${value.path})`)
  },

  'team note write': async ({ flags, client, cwd, json }) => {
    const content = await readFile(resolve(cwd, getRequiredStringFlag(flags, 'file')), 'utf8')
    const result = await client.call<{ path: string }>('orchestration.teamNoteWrite', {
      ...teamParams(flags),
      note: getRequiredStringFlag(flags, 'note'),
      content
    })
    printResult(result, json, (value) => `Wrote ${value.path}`)
  },

  'team task add': async ({ flags, client, json }) => {
    const result = await client.call<{
      enriched: boolean
      taskId: string | null
      ref?: string | null
    }>('orchestration.teamTaskCreate', {
      ...teamParams(flags),
      title: getRequiredStringFlag(flags, 'title'),
      spec: getOptionalStringFlag(flags, 'spec'),
      enrich: flags.has('enrich') ? true : undefined
    })
    printResult(result, json, (value) =>
      value.enriched ? 'Sent to the manager to write up.' : `Filed ${value.ref ?? value.taskId}`
    )
  }
}
