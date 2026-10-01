import type { OrchestrationDb } from '../orchestration/db'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'
import { findTeamMemberForTerminal } from './team-member-terminal'

export type TeamCaller =
  | { kind: 'operator' }
  | { kind: 'member'; member: TeamMemberRow; isManager: boolean }
  /**
   * One of Orca's terminals that is not on this team: another agent, a member's own sub-worker,
   * or a caller whose pane evidence did not verify. It has no team authority.
   */
  | { kind: 'agent' }

type CallerContext = Pick<RpcContext, 'runtime' | 'orchestrationCompatibilityEvidence'>

type CallerPane = { terminalHandle: string; paneKey: string }

/**
 * The pane a request provably came from; `agent` when it names a pane it cannot prove; `operator`
 * when it names none, which is the desktop and mobile UI or a shell outside Orca's terminals.
 *
 * Why unproven evidence is an agent and not the operator: an agent whose harness scrubs the launch
 * token from its tools still carries its handle, and failing open made it the human.
 *
 * The gap that remains: the evidence is the caller's own environment, so a process of the same
 * user that strips ORCA_TERMINAL_HANDLE, ORCA_PANE_KEY and ORCA_AGENT_LAUNCH_TOKEN before calling
 * still reads as the operator. Closing it needs a credential only the human's surfaces hold.
 */
function readCallerPane(context: CallerContext): CallerPane | 'agent' | 'operator' {
  const evidence = context.orchestrationCompatibilityEvidence
  // An exact match on a pane this runtime launched proves the caller without waiting for a hook,
  // so a member whose agent posts no hooks is not mistaken for an outsider.
  const attested = context.runtime.verifyOrchestrationCompatibilityCaller(evidence, {
    currentRuntimeLaunchSufficient: true
  })
  if (attested) {
    return attested
  }
  // The host stamp is left out: it names a machine, and a plain SSH or WSL shell carries it too.
  const namesPane = Boolean(
    evidence?.terminalHandle ||
    evidence?.paneKey ||
    evidence?.launchToken ||
    evidence?.agentSessionId
  )
  return namesPane ? 'agent' : 'operator'
}

/**
 * Who is calling, as far as one team is concerned.
 *
 * Why attestation and not a `--from` param: a member could otherwise omit its handle and act as
 * the human. A terminal is a member only when its launch token proves it and the roster lists it.
 */
export async function resolveTeamCaller(
  context: CallerContext,
  db: OrchestrationDb,
  team: TeamRow
): Promise<TeamCaller> {
  const pane = readCallerPane(context)
  if (pane === 'operator' || pane === 'agent') {
    return { kind: pane }
  }
  const member = findTeamMemberForTerminal(db, pane.terminalHandle, pane.paneKey)
  // A member of another team is an outsider here, exactly like a member's own sub-worker.
  return member?.team_id === team.id
    ? { kind: 'member', member, isManager: member.is_manager === 1 }
    : { kind: 'agent' }
}

/** The caller as the activity feed names a sender. */
export function teamCallerParticipant(caller: TeamCaller): { party: string; memberId?: string } {
  return caller.kind === 'member'
    ? { party: 'member', memberId: caller.member.id }
    : { party: caller.kind }
}

const AGENT_REFUSAL_HINT =
  " Orca treats a command from one of its own terminals as an agent's: use the Orca app, or a shell outside Orca."

function refuseTeamCaller(who: string | undefined, action: string, allowed: string): never {
  throw new OrchestrationError(
    'consumer_fenced',
    who
      ? `Team member ${who} cannot ${action}; only ${allowed} can.`
      : `This terminal cannot ${action}; only ${allowed} can.${AGENT_REFUSAL_HINT}`
  )
}

export function isTeamOperatorOrManager(caller: TeamCaller): boolean {
  return caller.kind === 'operator' || (caller.kind === 'member' && caller.isManager)
}

export function requireTeamOperator(caller: TeamCaller, action: string): void {
  if (caller.kind !== 'operator') {
    refuseTeamCaller(
      caller.kind === 'member' ? caller.member.slug : undefined,
      action,
      'the human operator'
    )
  }
}

/** The operator, or the team's manager acting for it. */
export function requireTeamOperatorOrManager(caller: TeamCaller, action: string): void {
  if (!isTeamOperatorOrManager(caller)) {
    refuseTeamCaller(
      caller.kind === 'member' ? caller.member.slug : undefined,
      action,
      'the manager or the operator'
    )
  }
}

/** For actions outside any one team, such as creating one: only the operator may take them. */
export async function requireNoTeamMemberCaller(
  context: CallerContext,
  db: OrchestrationDb,
  action: string
): Promise<void> {
  const pane = readCallerPane(context)
  if (pane === 'operator') {
    return
  }
  const member =
    pane === 'agent' ? undefined : findTeamMemberForTerminal(db, pane.terminalHandle, pane.paneKey)
  refuseTeamCaller(member?.slug, action, 'the human operator')
}
