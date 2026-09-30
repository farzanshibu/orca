import { getAppEnvironment } from '../../../shared/app-environment'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { resolveTerminalOrchestrationCliCommand } from '../orchestration/cli-command'
import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { runLegacyAgentLaunch } from '../rpc/methods/agent-launch'
import { resolveWorkerLaunchPreferences } from '../rpc/methods/orchestration/worker/worker-launch-preferences'
import { buildTeamMemberBrief } from './team-role-brief'
import { teamNotesRoot } from './team-notes'
import { ensureTeamMemberWorkspace, writeTeamMemberWorkspaceFiles } from './team-member-workspace'

/** Refuses an agent or model/effort pair the host could not launch, before anything is created. */
export function assertTeamMemberLaunchable(fields: {
  agent: string
  model?: string | null
  effort?: string | null
}): void {
  if (!isTuiAgent(fields.agent)) {
    throw new OrchestrationError('invalid_argument', `Unknown agent "${fields.agent}".`)
  }
  resolveWorkerLaunchPreferences({
    agent: fields.agent,
    model: fields.model ?? undefined,
    effort: fields.effort ?? undefined
  })
}

/** Whether the member's terminal is still running, rebinding a reminted handle by pane. */
export function resolveLiveTeamMemberHandle(
  runtime: RpcContext['runtime'],
  member: TeamMemberRow
): string | null {
  if (member.terminal_handle && runtime.getLiveTerminalPaneKey(member.terminal_handle)) {
    return member.terminal_handle
  }
  return member.pane_key ? runtime.getTerminalHandleForPaneKey(member.pane_key) : null
}

export async function startTeamMember(args: {
  context: RpcContext
  db: OrchestrationDb
  team: TeamRow
  member: TeamMemberRow
}): Promise<TeamMemberRow> {
  const { context, db, team, member } = args
  if (team.status === 'archived') {
    throw new OrchestrationError('team_conflict', `Team ${team.name} is archived.`)
  }
  const liveHandle = resolveLiveTeamMemberHandle(context.runtime, member)
  if (liveHandle) {
    return db.setTeamMemberDesiredState(member.id, 'running')
  }
  assertTeamMemberLaunchable(member)
  if (!isTuiAgent(member.agent)) {
    throw new OrchestrationError('invalid_argument', `Unknown agent "${member.agent}".`)
  }
  const repo = await context.runtime.showRepo(`id:${team.repo_id}`)
  const cli = resolveTerminalOrchestrationCliCommand({
    connectionId: repo.connectionId ?? null,
    isWsl: null,
    worktreeId: '',
    runtimeCliCommand: getAppEnvironment().isPackaged() ? undefined : 'orca-dev'
  })
  // Reuse the member's own workspace so a restart keeps its branch and uncommitted work.
  const workspace = await ensureTeamMemberWorkspace({ context, repo, team, member })
  db.bindTeamMemberTerminal(member.id, {
    worktreeId: workspace.worktreeId,
    terminalHandle: null,
    paneKey: null
  })
  await writeTeamMemberWorkspaceFiles({ repo, team, member, workspacePath: workspace.path })
  const brief = buildTeamMemberBrief({
    team,
    member,
    roster: db.listTeamMembers(team.id),
    cli,
    notesRoot: teamNotesRoot(repo, team)
  })
  const result = await runLegacyAgentLaunch(
    {
      agent: member.agent,
      target: { kind: 'existing', worktree: `id:${workspace.worktreeId}` },
      prompt: { text: brief, delivery: 'submit' },
      ...(member.model
        ? {
            sessionOptions: {
              model: member.model,
              ...(member.effort ? { effort: member.effort } : {})
            }
          }
        : {}),
      launchSource: 'orchestration'
    },
    context
  )
  const paneKey = result.outcome.kind === 'terminal' ? (result.outcome.paneKey ?? null) : null
  db.bindTeamMemberTerminal(member.id, {
    worktreeId: result.worktreeId,
    terminalHandle: result.outcome.handle,
    paneKey,
    orcaSessionId: result.outcome.kind === 'structured' ? result.outcome.sessionId : null
  })
  if (member.is_manager === 1 && paneKey) {
    bindTeamManagerRun(context, db, team, result.outcome.handle, paneKey)
  }
  return db.setTeamMemberDesiredState(member.id, 'running')
}

/**
 * Makes the manager the team Run's coordinator, as `run-use` would, so its dispatches, asks, and
 * worker_done mail land in the team Run without the agent having to bind itself first.
 */
function bindTeamManagerRun(
  context: RpcContext,
  db: OrchestrationDb,
  team: TeamRow,
  handle: string,
  paneKey: string
): void {
  const run = db.bindRun({
    runId: team.run_id,
    coordinatorHandle: handle,
    coordinatorPaneKey: paneKey
  })
  if (!run) {
    throw new OrchestrationError('run_not_found', `Team Run ${team.run_id} is missing.`)
  }
  context.runtime.cancelMessageWaiters(`run:${team.run_id}`)
}

export async function stopTeamMember(args: {
  runtime: RpcContext['runtime']
  db: OrchestrationDb
  member: TeamMemberRow
}): Promise<TeamMemberRow> {
  const { runtime, db, member } = args
  const handle = resolveLiveTeamMemberHandle(runtime, member)
  if (handle) {
    await runtime.closeTerminal(handle)
  }
  // Keep the worktree so a later start resumes in the same branch.
  db.bindTeamMemberTerminal(member.id, {
    worktreeId: member.worktree_id,
    terminalHandle: null,
    paneKey: null
  })
  return db.setTeamMemberDesiredState(member.id, 'stopped')
}

/** Types text into a member's agent as a new turn; `interrupt` first stops its current turn. */
export async function sendToTeamMember(args: {
  context: RpcContext
  member: TeamMemberRow
  text: string
  interrupt?: boolean
}): Promise<{ handle: string }> {
  const { context, member } = args
  const handle = resolveLiveTeamMemberHandle(context.runtime, member)
  if (!handle) {
    throw new OrchestrationError(
      'terminal_not_found',
      `Team member ${member.slug} is not running; start it first.`
    )
  }
  if (args.interrupt) {
    await context.runtime.sendTerminal(handle, { interrupt: true }, { inputKind: 'driving' })
  }
  await context.runtime.sendTerminalAgentPrompt(handle, args.text, { inputKind: 'driving' })
  return { handle }
}
