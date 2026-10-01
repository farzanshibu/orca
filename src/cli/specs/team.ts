import { GLOBAL_FLAGS, type CommandSpec } from '../args'

const TEAM = ['team', 'repo']
const MEMBER_FIELDS = ['display-name', 'role', 'brief', 'agent', 'model', 'effort']

export const TEAM_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['team', 'create'],
    summary: 'Create a standing team of named role agents for a repository',
    usage: 'orca team create --repo <selector> --name <name> [--charter <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'name', 'charter'],
    examples: ['orca team create --repo id:repo_1 --name Platform --charter "Ship the v2 API"']
  },
  {
    path: ['team', 'list'],
    summary: 'List teams',
    usage: 'orca team list [--repo <selector>] [--include-archived] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'include-archived']
  },
  {
    path: ['team', 'show'],
    summary: 'Show a team: members, tasks, and what is waiting on you',
    usage: 'orca team show --team <id|name> [--repo <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM]
  },
  {
    path: ['team', 'update'],
    summary: 'Change a team charter, or pause, resume, or archive it',
    usage:
      'orca team update --team <id|name> [--charter <text>] [--status active|paused|archived] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'charter', 'status']
  },
  {
    path: ['team', 'log'],
    summary: "Show the team's recent messages, newest first",
    usage: 'orca team log --team <id|name> [--limit <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'limit']
  },
  {
    path: ['team', 'activity'],
    summary:
      'Show what the team is doing, oldest first: mail, deliveries, dispatches, tasks, and goals',
    usage:
      'orca team activity --team <id|name> [--after <sequence>] [--limit <n>] [--follow] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'after', 'limit', 'follow'],
    examples: ['orca team activity --team Platform --follow']
  },
  {
    path: ['team', 'member', 'add'],
    summary: 'Add a member with a role, agent, and optional model',
    usage:
      'orca team member add --team <id|name> --slug <slug> --role <role> --agent <agent> [--brief <text>] [--display-name <name>] [--model <id>] [--effort <level>] [--manager] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'slug', ...MEMBER_FIELDS, 'manager', 'bundle'],
    notes: [
      '--bundle manager|engineer|frontend|backend|reviewer|qa|devops|security|docs|researcher|triage prefills role, brief, agent, and grants.'
    ],
    examples: [
      'orca team member add --team Platform --slug michael --role manager --agent claude --model opus --manager',
      'orca team member add --team Platform --slug jim --role engineer --agent codex'
    ]
  },
  {
    path: ['team', 'member', 'update'],
    summary: "Change a member's role, brief, agent, or model",
    usage:
      'orca team member update --team <id|name> --member <slug> [--role <role>] [--brief <text>] [--agent <agent>] [--model <id>] [--effort <level>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'member', ...MEMBER_FIELDS]
  },
  ...(['rm', 'start', 'stop', 'pause', 'resume'] as const).map((verb): CommandSpec => ({
    path: ['team', 'member', verb],
    summary:
      verb === 'rm'
        ? 'Remove a team member'
        : `${verb[0].toUpperCase()}${verb.slice(1)} a team member`,
    usage: `orca team member ${verb} --team <id|name> --member <slug> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'member'],
    ...(verb === 'rm' || verb === 'stop' ? { destructive: true } : {})
  })),
  {
    path: ['team', 'member', 'grant'],
    summary: "Replace a member's skills, connections, and MCP servers; applied on its next start",
    usage:
      'orca team member grant --team <id|name> --member <slug> [--skills <a,b>] [--connections <a,b>] [--mcp-file <servers.json>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'member', 'skills', 'connections', 'mcp-file'],
    notes: ['--mcp-file holds a JSON array of {name, command, args?, env?} or {name, url}.']
  },
  {
    path: ['team', 'member', 'export'],
    summary: 'Print a member as a shareable hire template',
    usage: 'orca team member export --team <id|name> --member <slug> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'member']
  },
  {
    path: ['team', 'member', 'import'],
    summary: 'Add a member from a hire template file',
    usage:
      'orca team member import --team <id|name> --file <template.json> [--slug <slug>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'file', 'slug']
  },
  {
    path: ['team', 'member', 'cap'],
    summary: 'Set or clear a member spend cap; crossing it pauses and interrupts the member',
    usage:
      'orca team member cap --team <id|name> --member <slug> --usd <amount|none> [--tokens <n|none>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'member', 'usd', 'tokens'],
    notes: ['Spend is an API-equivalent estimate from local Claude and Codex transcripts.']
  },
  {
    path: ['team', 'member', 'send'],
    summary: "Type a message into a member's agent; --interrupt stops its current turn first",
    usage:
      'orca team member send --team <id|name> --member <slug> --text <text> [--interrupt] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'member', 'text', 'interrupt']
  },
  {
    path: ['team', 'answer'],
    summary: "Answer a team member's pending question",
    usage: 'orca team answer --team <id|name> --id <message_id> --body <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'id', 'body']
  },
  {
    path: ['team', 'gate-resolve'],
    summary: "Resolve one of the team's decision gates",
    usage: 'orca team gate-resolve --team <id|name> --id <gate_id> --resolution <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'id', 'resolution']
  },
  {
    path: ['team', 'hire-propose'],
    summary: 'Propose a new member (manager); the human approves it',
    usage:
      'orca team hire-propose --team <id|name> --slug <slug> --role <role> --agent <agent> [--brief <text>] [--model <id>] [--rationale <why>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'slug', ...MEMBER_FIELDS, 'rationale']
  },
  {
    path: ['team', 'hire-decide'],
    summary: 'Approve or reject a proposed hire',
    usage:
      'orca team hire-decide --team <id|name> --id <proposal_id> --decision approve|reject [--note <text>] [--start] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'id', 'decision', 'note', 'start']
  },
  {
    path: ['team', 'mission', 'add'],
    summary: 'Schedule a mission: text delivered to a member on an interval or daily',
    usage:
      'orca team mission add --team <id|name> (--template standup|heartbeat|wrap-up | --name <n> --prompt <text> (--every <minutes> | --daily <HH:MM>)) [--target manager|@all|<slug>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      ...TEAM,
      'template',
      'name',
      'prompt',
      'every',
      'daily',
      'target'
    ]
  },
  {
    path: ['team', 'mission', 'list'],
    summary: "List a team's missions",
    usage: 'orca team mission list --team <id|name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM]
  },
  ...(['enable', 'disable', 'rm'] as const).map((verb): CommandSpec => ({
    path: ['team', 'mission', verb],
    summary:
      verb === 'rm' ? 'Remove a mission' : `${verb === 'enable' ? 'Enable' : 'Disable'} a mission`,
    usage: `orca team mission ${verb} --team <id|name> --id <mission_id> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'id']
  })),
  {
    path: ['team', 'triggers'],
    summary: 'Show or change outside triggers: trigger mode, webhook, and auto-compact',
    usage:
      'orca team triggers --team <id|name> [--mode communication-only|allow-all|off] [--webhook enable|disable|rotate] [--auto-compact-tokens <n|none>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'mode', 'webhook', 'auto-compact-tokens'],
    notes: [
      'The webhook listens on 127.0.0.1 only: POST {"text": "...", "target"?: "manager", "task"?: {"title", "spec"}} with Authorization: Bearer <token>.'
    ]
  },
  {
    path: ['team', 'memory'],
    summary: "Search the team's tickets, agents, and notes",
    usage: 'orca team memory --team <id|name> [--query <text>] [--limit <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'query', 'limit'],
    notes: ['Ranked keyword search; --json also returns the link graph.']
  },
  {
    path: ['team', 'note', 'read'],
    summary: 'Print a team note: board, members/<slug>, or notes/<name>',
    usage:
      'orca team note read --team <id|name> --note <board|members/<slug>|notes/<name>> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'note']
  },
  {
    path: ['team', 'note', 'write'],
    summary: 'Replace a team note with the contents of a file',
    usage: 'orca team note write --team <id|name> --note <path> --file <markdown> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'note', 'file']
  },
  {
    path: ['team', 'task', 'add'],
    summary: 'File a task on the team board; --enrich has the manager write it up first',
    usage: 'orca team task add --team <id|name> --title <text> [--spec <text>] [--enrich] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'title', 'spec', 'enrich']
  },
  {
    path: ['team', 'task', 'assign'],
    summary: "Assign a task to a member; Orca starts it in the member's terminal once it can",
    usage:
      'orca team task assign --team <id|name> --task <ref|id> (--member <slug> | --unassign) [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'task', 'member', 'unassign'],
    examples: ['orca team task assign --team Platform --task plat-3 --member jim']
  },
  {
    path: ['team', 'closing-time'],
    summary: 'Wind the team down: members wrap up and commit, then stop; the team pauses',
    usage: 'orca team closing-time --team <id|name> [--cancel] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...TEAM, 'cancel']
  }
]
