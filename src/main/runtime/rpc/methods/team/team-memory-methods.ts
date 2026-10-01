import {
  TeamMemoryParams,
  TeamNoteParams,
  TeamNoteWriteParams
} from '../../../../../shared/rpc-contract/orchestration-team-params'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { requireTeamOperator, resolveTeamCaller } from '../../../team/team-caller-authority'
import { teamHostFilesFor } from '../../../team/team-host-files'
import { collectTeamMemoryDocs } from '../../../team/team-memory-docs'
import { buildTeamMemoryGraph, rankTeamMemory } from '../../../team/team-memory-index'
import { isTeamNotePath, teamNoteFile, teamNotesRoot } from '../../../team/team-notes'
import { defineMethod } from '../../core'
import { resolveTeamFromParams } from './team-selector'

function requireNotePath(note: string) {
  if (!isTeamNotePath(note)) {
    throw new OrchestrationError(
      'invalid_argument',
      'A note is board, members/<slug>, or notes/<name> (lowercase letters, digits, dashes).'
    )
  }
  return note
}

export const TEAM_MEMORY_METHODS = [
  defineMethod({
    name: 'orchestration.teamMemory',
    params: TeamMemoryParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const repo = await context.runtime.showRepo(`id:${team.repo_id}`)
      const docs = await collectTeamMemoryDocs({
        db,
        team,
        files: teamHostFilesFor(repo),
        repoPath: repo.path
      })
      const hits = rankTeamMemory(docs, params.query ?? '', params.limit ?? 30)
      return {
        tickets: hits.filter((hit) => hit.kind === 'ticket'),
        agents: hits.filter((hit) => hit.kind === 'agent'),
        notes: hits.filter((hit) => hit.kind === 'note'),
        graph: buildTeamMemoryGraph(docs)
      }
    }
  }),

  defineMethod({
    name: 'orchestration.teamNoteRead',
    params: TeamNoteParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      const repo = await context.runtime.showRepo(`id:${team.repo_id}`)
      const path = teamNoteFile(teamNotesRoot(repo, team), requireNotePath(params.note))
      return { note: params.note, path, content: await teamHostFilesFor(repo).read(path) }
    }
  }),

  defineMethod({
    name: 'orchestration.teamNoteWrite',
    params: TeamNoteWriteParams,
    handler: async (params, context) => {
      const db = context.runtime.getOrchestrationDb()
      const team = await resolveTeamFromParams(context, db, params)
      // Members edit the files directly; this path is the operator's editor.
      requireTeamOperator(resolveTeamCaller(context, db, team), 'edit notes through Orca')
      const repo = await context.runtime.showRepo(`id:${team.repo_id}`)
      const path = teamNoteFile(teamNotesRoot(repo, team), requireNotePath(params.note))
      await teamHostFilesFor(repo).write(path, params.content)
      return { note: params.note, path }
    }
  })
]
