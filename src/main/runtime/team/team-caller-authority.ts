import type { OrchestrationDb } from '../orchestration/db'
import { isEquivalentPaneKey } from '../orchestration/db/pane-key-match'
import { OrchestrationError } from '../orchestration/orchestration-error'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import type { RpcContext } from '../rpc/core'

export type TeamCaller =
  | { kind: 'operator' }
  | { kind: 'member'; member: TeamMemberRow; isManager: boolean }

/**
 * Who is calling, as far as one team is concerned.
 *
 * Why attestation and not a `--from` param: a member could otherwise omit its handle and act as
 * the human. A terminal is a member only when its launch token proves it; any other caller — the
 * desktop and mobile UI, or a shell outside every member pane — is the operator.
 */
export function resolveTeamCaller(
  context: Pick<RpcContext, 'runtime' | 'orchestrationCompatibilityEvidence'>,
  db: OrchestrationDb,
  team: TeamRow
): TeamCaller {
  const attested = context.runtime.verifyOrchestrationCompatibilityCaller(
    context.orchestrationCompatibilityEvidence
  )
  if (!attested) {
    return { kind: 'operator' }
  }
  const member = db
    .listTeamMembers(team.id)
    .find(
      (candidate) =>
        candidate.terminal_handle === attested.terminalHandle ||
        Boolean(candidate.pane_key && isEquivalentPaneKey(candidate.pane_key, attested.paneKey))
    )
  return member
    ? { kind: 'member', member, isManager: member.is_manager === 1 }
    : { kind: 'operator' }
}

export function requireTeamOperator(caller: TeamCaller, action: string): void {
  if (caller.kind !== 'operator') {
    throw new OrchestrationError(
      'consumer_fenced',
      `Team member ${caller.member.slug} cannot ${action}; only the human operator can.`
    )
  }
}

/** The operator, or the team's manager acting for it. */
export function requireTeamOperatorOrManager(caller: TeamCaller, action: string): void {
  if (caller.kind === 'member' && !caller.isManager) {
    throw new OrchestrationError(
      'consumer_fenced',
      `Team member ${caller.member.slug} cannot ${action}; only the manager or the operator can.`
    )
  }
}

/** For actions outside any one team, such as creating one: no team member may take them. */
export function requireNoTeamMemberCaller(
  context: Pick<RpcContext, 'runtime' | 'orchestrationCompatibilityEvidence'>,
  db: OrchestrationDb,
  action: string
): void {
  const attested = context.runtime.verifyOrchestrationCompatibilityCaller(
    context.orchestrationCompatibilityEvidence
  )
  const member = attested ? db.findTeamMemberByTerminal(attested.terminalHandle) : undefined
  if (member) {
    throw new OrchestrationError(
      'consumer_fenced',
      `Team member ${member.slug} cannot ${action}; only the human operator can.`
    )
  }
}
