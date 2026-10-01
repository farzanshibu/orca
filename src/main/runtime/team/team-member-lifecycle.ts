import { getRepoKind } from '../../../shared/repo-kind'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { deliverTerminalAgentLaunchPrompt } from '../rpc/methods/agent-launch-terminal-prompt'
import { resolveWorkerLaunchPreferences } from '../rpc/methods/orchestration/worker/worker-launch-preferences'
import { buildTeamMemberBrief } from './team-role-brief'
import { carryTeamMemberDirectMail } from './team-member-direct-mail'
import { teamNotesRoot } from './team-notes'
import { ensureTeamMemberWorkspace, writeTeamMemberWorkspaceFiles } from './team-member-workspace'
import { teamCliCommand } from './team-workspace-facts'

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
  const agent = member.agent
  if (!isTuiAgent(agent)) {
    throw new OrchestrationError('invalid_argument', `Unknown agent "${agent}".`)
  }
  const repo = await context.runtime.showRepo(`id:${team.repo_id}`)
  const cli = teamCliCommand(repo)
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
    notesRoot: teamNotesRoot(repo, team),
    workspaceKind: getRepoKind(repo)
  })
  const launch = resolveWorkerLaunchPreferences({
    agent,
    model: member.model ?? undefined,
    effort: member.effort ?? undefined
  })
  // Why a terminal, not agent.launch: that may open a structured session, which has no pane for
  // dispatches, the queue, or the manager's Run binding to reach.
  const terminal = await context.runtime.createTerminal(`id:${workspace.worktreeId}`, {
    startupAgent: agent,
    ...(launch.preferences ? { launchPreferences: launch.preferences } : {}),
    title: member.display_name,
    surfaceOwner: false
  })
  const paneKey = terminal.paneKey ?? context.runtime.getTerminalPaneKey(terminal.handle)
  db.bindTeamMemberTerminal(member.id, {
    worktreeId: workspace.worktreeId,
    terminalHandle: terminal.handle,
    paneKey,
    orcaSessionId: null
  })
  if (member.is_manager === 1 && paneKey) {
    bindTeamManagerRun(context.runtime, db, team, terminal.handle, paneKey)
  }
  carryTeamMemberDirectMail({
    runtime: context.runtime,
    db,
    team,
    member,
    handle: terminal.handle
  })
  await deliverTerminalAgentLaunchPrompt({
    runtime: context.runtime,
    handle: terminal.handle,
    text: brief
  })
  return db.setTeamMemberDesiredState(member.id, 'running')
}

/**
 * Makes the manager the team Run's coordinator, as `run-use` would, so its dispatches, asks, and
 * worker_done mail land in the team Run without the agent having to bind itself first.
 */
export function bindTeamManagerRun(
  runtime: RpcContext['runtime'],
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
  runtime.cancelMessageWaiters(`run:${team.run_id}`)
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
