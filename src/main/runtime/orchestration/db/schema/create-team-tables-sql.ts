// Why a separate block: v43 adds these to existing databases, and createTables gives them to fresh ones.
export const TEAM_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS teams (
  id          TEXT PRIMARY KEY,
  repo_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  run_id      TEXT NOT NULL,
  charter     TEXT NOT NULL DEFAULT '',
  -- Short task refs like bmt-12: the prefix and the last number handed out.
  task_prefix TEXT NOT NULL DEFAULT 'task',
  task_counter INTEGER NOT NULL DEFAULT 0,
  -- What outside triggers may do: communication-only posts messages, allow-all may also create tasks.
  trigger_mode TEXT NOT NULL DEFAULT 'communication-only',
  -- Null disables inbound webhooks for this team.
  webhook_token TEXT,
  -- Send /compact to a member once it has used this many tokens since its last compact.
  auto_compact_tokens INTEGER,
  -- Set while Closing Time is winding the team down; cleared once every member has stopped.
  closing_at  TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_repo_name
  ON teams(repo_id, name) WHERE status != 'archived';
CREATE INDEX IF NOT EXISTS idx_teams_run ON teams(run_id);

CREATE TABLE IF NOT EXISTS team_members (
  id                   TEXT PRIMARY KEY,
  team_id              TEXT NOT NULL,
  slug                 TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  role_slug            TEXT NOT NULL,
  role_brief           TEXT NOT NULL DEFAULT '',
  agent                TEXT NOT NULL,
  model                TEXT,
  effort               TEXT,
  is_manager           INTEGER NOT NULL DEFAULT 0,
  -- JSON TeamMemberCapabilities: skills, connections, and MCP servers granted to this member.
  capabilities         TEXT NOT NULL DEFAULT '{}',
  desired_state        TEXT NOT NULL DEFAULT 'stopped' CHECK(desired_state IN ('running', 'stopped')),
  paused_at            TEXT,
  -- Operator-set ceiling in API-equivalent USD; the breaker pauses the member when it is crossed.
  spend_cap_usd        REAL,
  -- Token ceiling; works for agents Orca cannot price.
  token_cap            INTEGER,
  -- Why the breaker tripped, so the UI can tell a spend stop from an operator pause.
  pause_reason         TEXT,
  -- Last spend the monitor computed from the member's provider sessions (API-equivalent).
  spend_usd            REAL,
  spend_tokens         INTEGER,
  spend_updated_at     TEXT,
  compacted_at_tokens  INTEGER,
  worktree_id          TEXT,
  terminal_handle      TEXT,
  pane_key             TEXT,
  orca_session_id      TEXT,
  current_dispatch_id  TEXT,
  archived_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_slug
  ON team_members(team_id, slug) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_one_manager
  ON team_members(team_id) WHERE is_manager = 1 AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_terminal
  ON team_members(terminal_handle) WHERE terminal_handle IS NOT NULL;

-- Every provider session a member's pane has reported, because /clear and resume mint new ids and
-- spend must include the earlier ones.
CREATE TABLE IF NOT EXISTS team_member_sessions (
  member_id      TEXT NOT NULL,
  provider       TEXT NOT NULL,
  session_id     TEXT NOT NULL,
  worktree_id    TEXT,
  first_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, session_id)
);

CREATE TABLE IF NOT EXISTS team_task_refs (
  task_id   TEXT PRIMARY KEY,
  team_id   TEXT NOT NULL,
  number    INTEGER NOT NULL,
  UNIQUE (team_id, number)
);

-- What the operator queued for a member; the dispatcher sends the head once the agent is idle.
CREATE TABLE IF NOT EXISTS team_member_queue (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL,
  text          TEXT NOT NULL,
  position      REAL NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at  TEXT,
  failed_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_team_member_queue_pending
  ON team_member_queue(member_id, position) WHERE delivered_at IS NULL AND failed_reason IS NULL;

-- Scheduled missions: text delivered to a member (usually the manager) on an interval or daily.
CREATE TABLE IF NOT EXISTS team_missions (
  id            TEXT PRIMARY KEY,
  team_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  target        TEXT NOT NULL DEFAULT 'manager',
  prompt        TEXT NOT NULL,
  schedule      TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_run_at   TEXT,
  next_run_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_team_missions_team ON team_missions(team_id);

CREATE TABLE IF NOT EXISTS team_hire_proposals (
  id                     TEXT PRIMARY KEY,
  team_id                TEXT NOT NULL,
  proposed_by_member_id  TEXT,
  slug                   TEXT NOT NULL,
  display_name           TEXT NOT NULL,
  role_slug              TEXT NOT NULL,
  role_brief             TEXT NOT NULL DEFAULT '',
  agent                  TEXT NOT NULL,
  model                  TEXT,
  effort                 TEXT,
  rationale              TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  decision_note          TEXT,
  member_id              TEXT,
  decided_at             TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_team_hire_proposals_team_status
  ON team_hire_proposals(team_id, status);
`
