import type { TeamMember, TeamSnapshot, TeamTask } from './team-snapshot-types'

export function makeTeamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'member_1',
    slug: 'ada',
    display_name: 'Ada',
    role_slug: 'engineer',
    role_brief: '',
    agent: 'claude',
    model: null,
    effort: null,
    is_manager: 0,
    capabilities: '{}',
    desired_state: 'running',
    paused_at: null,
    pause_reason: null,
    spend_usd: null,
    spend_tokens: null,
    spend_cap_usd: null,
    token_cap: null,
    worktree_id: null,
    pane_key: null,
    live_handle: 'term_1',
    liveness: 'live',
    agent_status: 'idle',
    queue: [],
    ...overrides
  }
}

export function makeTeamTask(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task_1',
    ref: 'bmt-1',
    task_title: 'Task',
    spec: 'spec',
    status: 'ready',
    assignee_handle: null,
    created_at: '2026-09-28 10:00:00',
    completed_at: null,
    ...overrides
  }
}

export function makeTeamSnapshot(overrides: Partial<TeamSnapshot> = {}): TeamSnapshot {
  return {
    team: {
      id: 'team_1',
      repo_id: 'repo_1',
      name: 'Platform',
      run_id: 'run_1',
      charter: '',
      status: 'active',
      task_prefix: 'bmt'
    },
    members: [],
    tasks: [],
    pendingQuestions: [],
    pendingGates: [],
    pendingHires: [],
    ...overrides
  }
}
