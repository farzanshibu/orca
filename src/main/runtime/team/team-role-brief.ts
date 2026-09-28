import { parseTeamMemberCapabilities } from '../../../shared/team-capabilities'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'

function rosterLine(member: TeamMemberRow): string {
  const manager = member.is_manager === 1 ? ' (manager)' : ''
  return `- ${member.display_name}${manager}: @member:${member.slug}, role @role:${member.role_slug}, agent ${member.agent}`
}

/**
 * The first prompt a member receives. Kept short: long-lived context belongs in the notes files,
 * which survive restarts and stay out of every agent's prompt budget.
 */
export function buildTeamMemberBrief(args: {
  team: TeamRow
  member: TeamMemberRow
  roster: readonly TeamMemberRow[]
  cli: string
  /** Absolute path of the team's shared notes on the execution host. */
  notesRoot: string
}): string {
  const { team, member, roster, cli, notesRoot: notes } = args
  const grants = parseTeamMemberCapabilities(member.capabilities)
  const capabilityLines = [
    grants.skills.length > 0 ? `Skills to load before working: ${grants.skills.join(', ')}.` : null,
    grants.connections.length > 0
      ? `You may act on these connections: ${grants.connections.join(', ')}. Touch no others.`
      : null,
    grants.mcpServers.length > 0
      ? `MCP servers granted to you (in .mcp.json; do not commit Orca's edits to it): ${grants.mcpServers.map((server) => server.name).join(', ')}.`
      : null
  ]
  const lines = [
    `You are ${member.display_name}, a standing member of the "${team.name}" team in Orca.`,
    `Your role: ${member.role_slug}.`,
    member.role_brief ? `Role brief: ${member.role_brief}` : null,
    team.charter ? `Team charter: ${team.charter}` : null,
    '',
    'Team roster:',
    ...roster.map(rosterLine),
    '',
    `Shared board: ${notes}/board.md (shared by the whole team; the manager owns it; read it before starting work).`,
    `Your memory: ${notes}/members/${member.slug}.md (keep durable notes about your work here; condense it when it grows long).`,
    `Shared notes for anyone: ${notes}/notes/<topic>.md.`,
    ...capabilityLines,
    '',
    member.is_manager === 1
      ? [
          'You coordinate this team. Load the orchestration guide first:',
          `  ${cli} skills get orchestration`,
          `Bind yourself to the team's Run before anything else: \`${cli} orchestration run-use --id ${team.run_id}\``,
          `Dispatch work to an idle member's terminal with \`${cli} orchestration worker-start --task <id> --terminal <handle>\`.`,
          `See every member's terminal with \`${cli} team show --team ${team.id} --json\`.`,
          `When the team needs another member, propose one; the human approves it:`,
          `  ${cli} team hire-propose --team ${team.id} --slug <slug> --role <role> --agent <agent> --rationale <why>`,
          'Put questions for the human in a decision gate or an ask; never guess on irreversible choices.'
        ].join('\n')
      : [
          'Wait for work from the manager or the human. When a dispatch arrives, follow its preamble',
          'exactly, report completion the way it says, then wait again. Stay in your role.'
        ].join('\n')
  ]
  return lines.filter((line): line is string => line !== null).join('\n')
}
