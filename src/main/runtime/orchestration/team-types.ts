import { z } from 'zod'

export const TEAM_STATUSES = ['active', 'paused', 'archived'] as const
export type TeamStatus = (typeof TEAM_STATUSES)[number]

export const TEAM_MEMBER_DESIRED_STATES = ['running', 'stopped'] as const
export type TeamMemberDesiredState = (typeof TEAM_MEMBER_DESIRED_STATES)[number]

export const TEAM_HIRE_PROPOSAL_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const
export type TeamHireProposalStatus = (typeof TEAM_HIRE_PROPOSAL_STATUSES)[number]

const nullableText = z.string().nullable()

export const TeamRowSchema = z.object({
  id: z.string(),
  repo_id: z.string(),
  name: z.string(),
  /** The standing orchestration Run every member's mail, tasks, and gates live in. */
  run_id: z.string(),
  charter: z.string(),
  task_prefix: z.string(),
  task_counter: z.number(),
  trigger_mode: z.string(),
  webhook_token: z.string().nullable(),
  auto_compact_tokens: z.number().nullable(),
  closing_at: z.string().nullable(),
  status: z.enum(TEAM_STATUSES),
  created_at: z.string(),
  updated_at: z.string()
})
export type TeamRow = z.infer<typeof TeamRowSchema>

export const TeamMemberRowSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  /** Stable address inside the team: `@member:<slug>`. */
  slug: z.string(),
  display_name: z.string(),
  /** Groups members for `@role:<slug>` fan-out; several members may share a role. */
  role_slug: z.string(),
  role_brief: z.string(),
  /** A TuiAgent id; stored as text so a newer agent never breaks an older reader. */
  agent: z.string(),
  model: nullableText,
  effort: nullableText,
  is_manager: z.number(),
  capabilities: z.string(),
  desired_state: z.enum(TEAM_MEMBER_DESIRED_STATES),
  /** Set while the operator has paused this member; paused members take no new assignments. */
  paused_at: nullableText,
  spend_cap_usd: z.number().nullable(),
  token_cap: z.number().nullable(),
  pause_reason: nullableText,
  spend_usd: z.number().nullable(),
  spend_tokens: z.number().nullable(),
  spend_updated_at: nullableText,
  compacted_at_tokens: z.number().nullable(),
  worktree_id: nullableText,
  terminal_handle: nullableText,
  pane_key: nullableText,
  orca_session_id: nullableText,
  current_dispatch_id: nullableText,
  archived_at: nullableText,
  created_at: z.string(),
  updated_at: z.string()
})
export type TeamMemberRow = z.infer<typeof TeamMemberRowSchema>

export const TeamHireProposalRowSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  proposed_by_member_id: nullableText,
  slug: z.string(),
  display_name: z.string(),
  role_slug: z.string(),
  role_brief: z.string(),
  agent: z.string(),
  model: nullableText,
  effort: nullableText,
  rationale: z.string(),
  status: z.enum(TEAM_HIRE_PROPOSAL_STATUSES),
  decision_note: nullableText,
  member_id: nullableText,
  decided_at: nullableText,
  created_at: z.string()
})
export type TeamHireProposalRow = z.infer<typeof TeamHireProposalRowSchema>
