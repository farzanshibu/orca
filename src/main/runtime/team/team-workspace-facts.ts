import { getAppEnvironment } from '../../../shared/app-environment'
import { getRepoKind } from '../../../shared/repo-kind'
import type { Repo } from '../../../shared/repo-types'
import { resolveTerminalOrchestrationCliCommand } from '../orchestration/cli-command'
import type { TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'

/** What a prompt needs to know about where a team works. */
export type TeamWorkspaceFacts = {
  /** The Orca CLI as a member's terminal spells it. */
  cli: string
  /** `git`: each member has its own worktree and branch. `folder`: everyone shares one folder. */
  kind: 'git' | 'folder'
}

export function teamCliCommand(repo: Pick<Repo, 'connectionId'>): string {
  return resolveTerminalOrchestrationCliCommand({
    connectionId: repo.connectionId ?? null,
    isWsl: null,
    worktreeId: '',
    runtimeCliCommand: getAppEnvironment().isPackaged() ? undefined : 'orca-dev'
  })
}

export async function readTeamWorkspaceFacts(
  runtime: Pick<RpcContext['runtime'], 'showRepo'>,
  team: Pick<TeamRow, 'repo_id'>
): Promise<TeamWorkspaceFacts> {
  const repo = await runtime.showRepo(`id:${team.repo_id}`)
  return { cli: teamCliCommand(repo), kind: getRepoKind(repo) }
}
