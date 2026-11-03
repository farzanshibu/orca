import type { OrchestrationDb } from '../orchestration/db'
import type { TeamRow } from '../orchestration/team-types'
import { joinWorkspacePath, type TeamHostFiles } from './team-host-files'
import { findTeamMemoryMentions, type TeamMemoryDoc } from './team-memory-index'
import { teamNotesSlug } from './team-notes'

const MAX_NOTE_FILES = 200
const MAX_NOTE_CHARS = 20_000

/** Everything the team knows, as searchable docs: tasks, members, and the shared notes. */
export async function collectTeamMemoryDocs(args: {
  db: OrchestrationDb
  team: TeamRow
  files: TeamHostFiles
  repoPath: string
}): Promise<TeamMemoryDoc[]> {
  const { db, team, files, repoPath } = args
  const members = db.listTeamMembers(team.id)
  const refs = db.assignTeamTaskRefs(team.id)
  const tasks = db.listTasksWithDispatch({ runId: team.run_id })
  const memberIdsBySlug = new Map(members.map((member) => [member.slug, member.id]))
  const memberIdByHandle = new Map(
    members.flatMap((member) =>
      member.terminal_handle ? [[member.terminal_handle, member.id]] : []
    )
  )
  const taskIdsByRef = new Map(
    tasks.flatMap((task) => {
      const ref = refs.get(task.id)
      return ref ? [[ref, task.id]] : []
    })
  )

  const docs: TeamMemoryDoc[] = []
  for (const task of tasks.toReversed()) {
    const owner = task.assignee_handle ? memberIdByHandle.get(task.assignee_handle) : undefined
    docs.push({
      kind: 'ticket',
      id: task.id,
      title: `${refs.get(task.id) ?? task.id} ${task.task_title ?? task.spec.slice(0, 80)}`,
      text: [task.spec, task.result ?? '', `status: ${task.status}`].join('\n'),
      links: owner ? [owner] : []
    })
  }
  for (const member of members) {
    docs.push({
      kind: 'agent',
      id: member.id,
      title: `${member.display_name} (${member.role_slug})`,
      text: [member.role_brief, `agent: ${member.agent}`, member.model ?? ''].join('\n'),
      links: []
    })
  }

  const root = joinWorkspacePath(repoPath, `.orca/team/${teamNotesSlug(team)}`)
  const noteFiles: { id: string; title: string; path: string; owner?: string }[] = [
    { id: 'note:board', title: 'Board', path: joinWorkspacePath(root, 'board.md') }
  ]
  for (const dir of ['members', 'notes'] as const) {
    for (const name of (await files.list(joinWorkspacePath(root, dir))).slice(0, MAX_NOTE_FILES)) {
      if (!name.endsWith('.md')) {
        continue
      }
      const stem = name.slice(0, -'.md'.length)
      noteFiles.push({
        id: `note:${dir}/${stem}`,
        title: dir === 'members' ? `${stem} memory` : stem,
        path: joinWorkspacePath(root, `${dir}/${name}`),
        owner: dir === 'members' ? memberIdsBySlug.get(stem) : undefined
      })
    }
  }
  for (const note of noteFiles) {
    const text = (await files.read(note.path))?.slice(0, MAX_NOTE_CHARS)
    if (text === undefined || text === null) {
      continue
    }
    const mentions = findTeamMemoryMentions(text, memberIdsBySlug, taskIdsByRef)
    docs.push({
      kind: 'note',
      id: note.id,
      title: note.title,
      text,
      links: note.owner ? [note.owner, ...mentions] : mentions
    })
  }
  return docs
}
