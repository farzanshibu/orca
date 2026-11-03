import { isFolderRepo } from '../../../shared/repo-kind'
import type { Repo } from '../../../shared/repo-types'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import { joinWorkspacePath, type TeamHostFiles } from './team-host-files'

const NOTES_EXCLUDE_LINE = '/.orca/team/'

export function teamNotesSlug(team: Pick<TeamRow, 'name'>): string {
  const slug = team.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'team'
}

/**
 * The one place a team's board and memory live: under the repository's main checkout on the
 * execution host. Why not each member's worktree: those are separate checkouts, so per-worktree
 * notes would silently fork the board.
 */
export function teamNotesRoot(repo: Pick<Repo, 'path'>, team: Pick<TeamRow, 'name'>): string {
  return joinWorkspacePath(repo.path, `.orca/team/${teamNotesSlug(team)}`)
}

export type TeamNotePath = 'board' | `members/${string}` | `notes/${string}`

const NOTE_PATH_PATTERN =
  /^(board|members\/[a-z0-9][a-z0-9-]{0,39}|notes\/[a-z0-9][a-z0-9-]{0,63})$/

/** Only `board`, `members/<slug>`, and `notes/<name>` are addressable; nothing escapes the root. */
export function isTeamNotePath(value: string): value is TeamNotePath {
  return NOTE_PATH_PATTERN.test(value)
}

export function teamNoteFile(root: string, note: TeamNotePath): string {
  return joinWorkspacePath(root, `${note}.md`)
}

/** Keeps notes out of commits without touching the tracked `.gitignore`. */
async function ensureNotesExcluded(files: TeamHostFiles, repo: Repo): Promise<void> {
  if (isFolderRepo(repo)) {
    return
  }
  const excludePath = joinWorkspacePath(repo.path, '.git/info/exclude')
  const current = await files.read(excludePath)
  if (current === null || current.split('\n').includes(NOTES_EXCLUDE_LINE)) {
    // Null: `.git` is a file (a linked checkout) or missing; leave its exclude alone.
    return
  }
  await files.write(excludePath, `${current.replace(/\n?$/, '\n')}${NOTES_EXCLUDE_LINE}\n`)
}

export async function seedTeamNotes(args: {
  files: TeamHostFiles
  repo: Repo
  team: TeamRow
  member: TeamMemberRow
}): Promise<void> {
  const { files, repo, team, member } = args
  const root = teamNotesRoot(repo, team)
  await ensureNotesExcluded(files, repo)
  const seeds: [TeamNotePath, string][] = [
    ['board', `# ${team.name} board\n\n${team.charter}\n`],
    [`members/${member.slug}`, `# ${member.display_name} (${member.role_slug})\n`]
  ]
  for (const [note, content] of seeds) {
    const path = teamNoteFile(root, note)
    if ((await files.read(path)) === null) {
      await files.write(path, content)
    }
  }
}
