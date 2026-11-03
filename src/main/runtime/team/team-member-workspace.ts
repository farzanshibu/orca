import { isFolderRepo } from '../../../shared/repo-kind'
import type { Repo } from '../../../shared/repo-types'
import { parseTeamMemberCapabilities, type TeamMcpServer } from '../../../shared/team-capabilities'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { joinWorkspacePath, teamHostFilesFor } from './team-host-files'
import { seedTeamNotes } from './team-notes'

export function mergeMcpServers(
  existing: string | null,
  servers: readonly TeamMcpServer[]
): string {
  let config: Record<string, unknown> = {}
  if (existing) {
    try {
      const parsed: unknown = JSON.parse(existing)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        config = { ...parsed }
      }
    } catch {
      // An unreadable file is replaced rather than left blocking the member's grants.
    }
  }
  const current = config.mcpServers
  const merged: Record<string, unknown> =
    current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {}
  for (const { name, ...server } of servers) {
    merged[name] = server.url ? { type: 'http', url: server.url } : server
  }
  return `${JSON.stringify({ ...config, mcpServers: merged }, null, 2)}\n`
}

/** The member's own workspace: reused, the shared folder of a folder project, or a new worktree. */
export async function ensureTeamMemberWorkspace(args: {
  context: RpcContext
  repo: Repo
  team: TeamRow
  member: TeamMemberRow
}): Promise<{ worktreeId: string; path: string }> {
  const { context, repo, team, member } = args
  const { runtime } = context
  if (member.worktree_id) {
    const existing = await runtime.showManagedWorktree(`id:${member.worktree_id}`)
    return { worktreeId: existing.id, path: existing.path }
  }
  if (isFolderRepo(repo)) {
    const [workspace] = (await runtime.listManagedWorktrees(`id:${repo.id}`, 1)).worktrees
    if (!workspace) {
      throw new OrchestrationError(
        'invalid_argument',
        `Folder project ${repo.displayName} has no workspace.`
      )
    }
    return { worktreeId: workspace.id, path: workspace.path }
  }
  const created = await runtime.createManagedWorktree({
    repoSelector: `id:${repo.id}`,
    name: `team-${member.slug}`,
    displayName: `${team.name}: ${member.display_name}`,
    activate: false
  })
  return { worktreeId: created.worktree.id, path: created.worktree.path }
}

/**
 * Seeds the team's shared notes and writes the member's MCP grants before the agent starts, so the
 * agent reads them at boot. Existing notes are never overwritten.
 */
export async function writeTeamMemberWorkspaceFiles(args: {
  repo: Repo
  team: TeamRow
  member: TeamMemberRow
  workspacePath: string
}): Promise<void> {
  const { repo, team, member, workspacePath } = args
  const files = teamHostFilesFor(repo)
  await seedTeamNotes({ files, repo, team, member })
  const { mcpServers } = parseTeamMemberCapabilities(member.capabilities)
  if (mcpServers.length > 0) {
    const path = joinWorkspacePath(workspacePath, '.mcp.json')
    await files.write(path, mergeMcpServers(await files.read(path), mcpServers))
  }
}
