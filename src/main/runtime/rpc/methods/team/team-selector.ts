import type { OrchestrationDb } from '../../../orchestration/db'
import type { TeamRow } from '../../../orchestration/team-types'
import type { RpcContext } from '../../core'

/** `--team` takes an id or a name; `--repo` narrows a name that several repos share. */
export async function resolveTeamFromParams(
  context: Pick<RpcContext, 'runtime'>,
  db: OrchestrationDb,
  params: { team: string; repo?: string }
): Promise<TeamRow> {
  const repoId = params.repo ? (await context.runtime.showRepo(params.repo)).id : undefined
  return db.resolveTeamSelector(params.team, repoId)
}
