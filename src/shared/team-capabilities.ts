import { z } from 'zod'

const McpServerSchema = z
  .object({
    name: z.string().min(1).max(64),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).max(64).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().url().optional()
  })
  .refine((server) => Boolean(server.command) !== Boolean(server.url), {
    message: 'An MCP server needs exactly one of command or url.'
  })
export type TeamMcpServer = z.infer<typeof McpServerSchema>

/** What one member may use beyond its agent's defaults. */
export const TeamMemberCapabilitiesSchema = z.object({
  /** Skill names the member should load (installed skills or bundled Orca guides). */
  skills: z.array(z.string().min(1).max(128)).max(64).default([]),
  /** Integrations the member may act on, e.g. github, linear, jira, slack. */
  connections: z.array(z.string().min(1).max(64)).max(32).default([]),
  mcpServers: z.array(McpServerSchema).max(32).default([])
})
export type TeamMemberCapabilities = z.infer<typeof TeamMemberCapabilitiesSchema>

export const EMPTY_TEAM_MEMBER_CAPABILITIES: TeamMemberCapabilities = {
  skills: [],
  connections: [],
  mcpServers: []
}

/** Tolerates stored JSON from any version: unknown or invalid shapes read as no grants. */
export function parseTeamMemberCapabilities(
  raw: string | null | undefined
): TeamMemberCapabilities {
  if (!raw) {
    return EMPTY_TEAM_MEMBER_CAPABILITIES
  }
  try {
    const parsed = TeamMemberCapabilitiesSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : EMPTY_TEAM_MEMBER_CAPABILITIES
  } catch {
    return EMPTY_TEAM_MEMBER_CAPABILITIES
  }
}

export type TeamRoleBundle = {
  id: string
  label: string
  role: string
  brief: string
  agent: string
  manager?: boolean
  capabilities: TeamMemberCapabilities
}

function bundle(
  id: string,
  label: string,
  brief: string,
  capabilities: Partial<TeamMemberCapabilities> = {},
  extra: { agent?: string; manager?: boolean } = {}
): TeamRoleBundle {
  return {
    id,
    label,
    role: id,
    brief,
    agent: extra.agent ?? 'claude',
    ...(extra.manager ? { manager: true } : {}),
    capabilities: { ...EMPTY_TEAM_MEMBER_CAPABILITIES, ...capabilities }
  }
}

/** One-click member setups: a role, a brief, and the grants that role usually needs. */
export const TEAM_ROLE_BUNDLES: readonly TeamRoleBundle[] = [
  bundle(
    'manager',
    'Manager',
    'Break the goal into tasks, dispatch them to the right members, keep the board current, and escalate decisions to the human.',
    { skills: ['orchestration'], connections: ['github'] },
    { manager: true }
  ),
  bundle(
    'engineer',
    'Engineer',
    'Implement assigned tasks end to end with tests. Keep changes small and report what changed and what is left.',
    { connections: ['github'] },
    { agent: 'codex' }
  ),
  bundle(
    'frontend',
    'Frontend engineer',
    'Build and fix UI. Follow the project style guide, check every state (loading, empty, error), and verify in the running app.'
  ),
  bundle(
    'backend',
    'Backend engineer',
    'Own APIs, data, and services. Preserve compatibility, add migrations with tests, and call out anything irreversible.',
    {},
    { agent: 'codex' }
  ),
  bundle(
    'reviewer',
    'Reviewer',
    'Review diffs for correctness, security, and clarity. Report findings with file and line; do not rewrite the author’s work.',
    { connections: ['github'] }
  ),
  bundle(
    'qa',
    'QA tester',
    'Reproduce reported bugs, write failing tests first, and verify fixes against the original report before closing tasks.'
  ),
  bundle(
    'devops',
    'DevOps',
    'Keep CI, builds, and deploy scripts healthy. Never run destructive infrastructure commands without a decision gate.',
    { connections: ['github'] }
  ),
  bundle(
    'security',
    'Security reviewer',
    'Audit changes and dependencies for vulnerabilities, secrets, and unsafe input handling. Escalate anything exploitable.'
  ),
  bundle(
    'docs',
    'Docs writer',
    'Write and update READMEs, guides, and changelogs for the team’s changes in plain language for a new reader.'
  ),
  bundle(
    'researcher',
    'Researcher',
    'Investigate questions in the codebase and docs, compare options, and return a short recommendation with evidence.'
  ),
  bundle(
    'triage',
    'Triage',
    'Read incoming issues and alerts, deduplicate them, label priority, and turn actionable ones into tasks for the manager.',
    { connections: ['github', 'linear', 'jira'] }
  )
]

export const TEAM_HIRE_TEMPLATE_SPEC = 'orca/team-hire@1'

/** A portable member template, shareable as JSON. */
export const TeamHireTemplateSchema = z.object({
  spec: z.literal(TEAM_HIRE_TEMPLATE_SPEC),
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(40),
  brief: z.string().max(4000).default(''),
  agent: z.string().min(1),
  model: z.string().optional(),
  effort: z.string().optional(),
  capabilities: TeamMemberCapabilitiesSchema.default(EMPTY_TEAM_MEMBER_CAPABILITIES)
})
export type TeamHireTemplate = z.infer<typeof TeamHireTemplateSchema>
