import { parseTeamMemberCapabilities } from '../../../shared/team-capabilities'
import type { TeamMemberRow, TeamRow } from '../orchestration/team-types'
import { TEAM_PEER_THREAD_REPLY_CAP } from './team-mail-thread-cap'

function rosterLine(member: TeamMemberRow): string {
  const manager = member.is_manager === 1 ? ' (manager)' : ''
  return `- ${member.display_name}${manager}: @member:${member.slug}, role @role:${member.role_slug}, agent ${member.agent}`
}

/** How members address each other; the same addresses work whether the teammate is busy or idle. */
function teamMailLines(cli: string, member: TeamMemberRow): string[] {
  const manager =
    member.is_manager === 1 ? '' : ' The manager is always reachable at --to @role:manager.'
  return [
    `Message one teammate: \`${cli} orchestration send --to @member:<slug> --subject <subject> --body <text>\`; everyone in a role: --to @role:<role>.${manager}`,
    `Read your mail with \`${cli} orchestration check\` and answer with the reply command each message shows, which keeps the thread. A stopped teammate comes back as a warning, not a delivery.`,
    `Once two members have traded ${TEAM_PEER_THREAD_REPLY_CAP} replies in one thread, Orca hands it to the manager instead of delivering more.`
  ]
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
  /** `git`: one worktree and branch per member. `folder`: everyone shares one folder. */
  workspaceKind: 'git' | 'folder'
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
    ...teamMailLines(cli, member),
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
          'A goal arrives as a queued `GOAL <ref>:` message. Plan it into tasks, one owner each:',
          `  ${cli} team task add --team ${team.id} --goal <goal_ref> --title <title> --spec <spec> --assignee <slug> [--deps <ref,ref>]`,
          "Orca starts each task in its owner's own terminal once its --deps are done and the owner is free;",
          'tasks with no dependency between them run at the same time. Do not dispatch them yourself.',
          `Give an existing task an owner, or a failed one another try: \`${cli} team task assign --team ${team.id} --task <ref> --member <slug>\`.`,
          args.workspaceKind === 'folder'
            ? 'Every member works in the same folder: split work by path so no two edit the same files. There is nothing to merge.'
            : "Each member works in its own worktree and branch. When a goal's tasks are done, merge the branches (pull or merge requests on your git host, or locally).",
          `Orca asks you once to review a goal whose tasks are all done. Close it with \`${cli} team goal close --team ${team.id} --goal <goal_ref> --summary <what was delivered>\`; add --cancel to stop one.`,
          `See every member, task, and goal with \`${cli} team show --team ${team.id} --json\`.`,
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
