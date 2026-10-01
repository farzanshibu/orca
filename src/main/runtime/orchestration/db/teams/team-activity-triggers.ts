import type Database from '../../../../sqlite/sync-database'

// Mirrors isEquivalentPaneKey: the leaf after the first ':' survives a tab break-out.
const leafSql = (paneKey: string): string => `substr(${paneKey}, instr(${paneKey}, ':') + 1)`

function memberByTerminalSql(team: string, handle: string, paneKey: string | null): string {
  const paneMatch = paneKey
    ? ` OR (${paneKey} IS NOT NULL AND m.pane_key IS NOT NULL AND ${leafSql('m.pane_key')} = ${leafSql(paneKey)})`
    : ''
  return `(SELECT m.id FROM team_members m
    WHERE m.team_id = ${team} AND m.archived_at IS NULL
      AND (m.terminal_handle = ${handle}${paneMatch})
    ORDER BY m.terminal_handle = ${handle} DESC LIMIT 1)`
}

function managerSql(team: string): string {
  return `(SELECT m.id FROM team_members m
    WHERE m.team_id = ${team} AND m.is_manager = 1 AND m.archived_at IS NULL LIMIT 1)`
}

/** The member an address reaches: the Run mailbox is the manager's, a Dispatch mailbox its assignee's. */
function memberForAddressSql(
  team: string,
  runId: string,
  address: string,
  paneKey: string | null
): string {
  return `CASE
    WHEN ${address} = 'run:' || ${runId} THEN ${managerSql(team)}
    WHEN ${address} LIKE 'dispatch:%' THEN (
      SELECT ${memberByTerminalSql(team, 'd.assignee_handle', 'd.assignee_pane_key')}
      FROM dispatch_contexts d WHERE d.id = substr(${address}, 10))
    ELSE ${memberByTerminalSql(team, address, paneKey)}
  END`
}

/** Who a non-member address is: the human, an outside trigger, Orca itself, or another agent. */
function partySql(memberId: string, address: string): string {
  return `CASE
    WHEN ${memberId} IS NOT NULL THEN 'member'
    WHEN ${address} = 'orca:operator' THEN 'operator'
    WHEN ${address} LIKE 'external:%' THEN 'external'
    WHEN ${address} LIKE 'orca:%' THEN 'system'
    ELSE 'agent'
  END`
}

const taskSubjectSql = (task: string): string =>
  `COALESCE(${task}.task_title, ${task}.display_name, substr(${task}.spec, 1, 120), '')`

const DISPATCH_ACTIVITY_INSERT_SQL = `INSERT INTO team_activity (
    team_id, kind, status, task_id, dispatch_id, from_party, from_member_id, to_party,
    to_member_id, subject, detail
  )
  SELECT x.team_id,
    CASE WHEN NEW.status = 'dispatched' THEN 'dispatch_started' ELSE 'dispatch_failed' END,
    NEW.status, NEW.task_id, NEW.id,
    CASE WHEN x.creator IS NOT NULL THEN 'member' ELSE 'system' END, x.creator,
    CASE WHEN x.worker IS NOT NULL THEN 'member' ELSE 'agent' END, x.worker,
    COALESCE((SELECT ${taskSubjectSql('k')} FROM tasks k WHERE k.id = NEW.task_id), ''),
    CASE WHEN NEW.status = 'dispatched' THEN NULL ELSE substr(NEW.last_failure, 1, 280) END
  FROM (
    SELECT t.id AS team_id,
      ${memberByTerminalSql('t.id', 'NEW.creator_handle', 'NEW.creator_pane_key')} AS creator,
      ${memberByTerminalSql('t.id', 'NEW.assignee_handle', 'NEW.assignee_pane_key')} AS worker
    FROM teams t WHERE t.run_id = NEW.run_id
  ) x;`

const TEAM_ACTIVITY_TRIGGERS_SQL = `
CREATE TRIGGER trg_team_activity_message_insert
AFTER INSERT ON messages
WHEN NEW.type <> 'heartbeat' AND EXISTS (SELECT 1 FROM teams WHERE run_id = NEW.run_id)
BEGIN
  INSERT INTO team_activity (
    team_id, kind, channel, message_id, message_type, dispatch_id, task_id, thread_id,
    from_party, from_member_id, to_party, to_member_id, subject, detail
  )
  SELECT x.team_id, 'message', 'mailbox', NEW.id, NEW.type, x.dispatch_id,
    (SELECT task_id FROM dispatch_contexts WHERE id = x.dispatch_id), NEW.thread_id,
    ${partySql('x.from_member', 'NEW.from_handle')}, x.from_member,
    ${partySql('x.to_member', 'NEW.to_handle')}, x.to_member, NEW.subject,
    NULLIF(substr(NEW.body, 1, 280), '')
  FROM (
    SELECT t.id AS team_id,
      ${memberForAddressSql('t.id', 't.run_id', 'NEW.from_handle', 'NEW.sender_pane_key')} AS from_member,
      ${memberForAddressSql('t.id', 't.run_id', 'NEW.to_handle', null)} AS to_member,
      CASE
        WHEN NEW.from_handle LIKE 'dispatch:%' THEN substr(NEW.from_handle, 10)
        WHEN NEW.to_handle LIKE 'dispatch:%' THEN substr(NEW.to_handle, 10)
        ELSE (SELECT id FROM dispatch_contexts
              WHERE run_id = NEW.run_id AND assignee_handle = NEW.from_handle
                AND status IN ('pending', 'dispatched')
              ORDER BY rowid DESC LIMIT 1)
      END AS dispatch_id
    FROM teams t WHERE t.run_id = NEW.run_id
  ) x;
END;

CREATE TRIGGER trg_team_activity_message_read
AFTER UPDATE OF read ON messages
WHEN OLD.read = 0 AND NEW.read = 1 AND NEW.type <> 'heartbeat'
  AND EXISTS (SELECT 1 FROM teams WHERE run_id = NEW.run_id)
BEGIN
  INSERT INTO team_activity (
    team_id, kind, channel, status, message_id, message_type, thread_id,
    from_party, from_member_id, to_party, to_member_id, subject
  )
  SELECT x.team_id, 'delivery', 'mailbox', 'read', NEW.id, NEW.type, NEW.thread_id,
    'system', NULL, ${partySql('x.to_member', 'NEW.to_handle')}, x.to_member, NEW.subject
  FROM (
    SELECT t.id AS team_id,
      ${memberForAddressSql('t.id', 't.run_id', 'NEW.to_handle', null)} AS to_member
    FROM teams t WHERE t.run_id = NEW.run_id
  ) x;
END;

CREATE TRIGGER trg_team_activity_task_insert
AFTER INSERT ON tasks
WHEN EXISTS (SELECT 1 FROM teams WHERE run_id = NEW.run_id)
BEGIN
  UPDATE teams SET task_counter = task_counter + 1 WHERE run_id = NEW.run_id;
  INSERT OR IGNORE INTO team_task_refs (task_id, team_id, number)
  SELECT NEW.id, t.id, t.task_counter FROM teams t WHERE t.run_id = NEW.run_id;
  INSERT INTO team_activity (
    team_id, kind, status, task_id, from_party, from_member_id, to_party, subject
  )
  SELECT x.team_id, 'task_created', NEW.status, NEW.id,
    CASE WHEN x.creator IS NOT NULL THEN 'member' ELSE 'operator' END, x.creator, 'team',
    ${taskSubjectSql('NEW')}
  FROM (
    SELECT t.id AS team_id,
      ${memberByTerminalSql('t.id', 'NEW.created_by_terminal_handle', 'NEW.created_by_pane_key')} AS creator
    FROM teams t WHERE t.run_id = NEW.run_id
  ) x;
END;

CREATE TRIGGER trg_team_activity_task_status
AFTER UPDATE OF status ON tasks
WHEN NEW.status <> OLD.status AND NEW.status IN ('ready', 'blocked', 'completed', 'failed')
  AND EXISTS (SELECT 1 FROM teams WHERE run_id = NEW.run_id)
BEGIN
  INSERT INTO team_activity (
    team_id, kind, status, task_id, dispatch_id, from_party, from_member_id, to_party,
    to_member_id, subject, detail
  )
  SELECT x.team_id,
    CASE WHEN NEW.status IN ('completed', 'failed') THEN 'task_settled' ELSE 'task_status' END,
    NEW.status, NEW.id, x.dispatch_id,
    CASE WHEN x.worker IS NOT NULL THEN 'member' ELSE 'system' END, x.worker,
    'member', x.manager, ${taskSubjectSql('NEW')},
    CASE WHEN NEW.status IN ('completed', 'failed') THEN substr(NEW.result, 1, 280) END
  FROM (
    SELECT t.id AS team_id, d.id AS dispatch_id, ${managerSql('t.id')} AS manager,
      ${memberByTerminalSql('t.id', 'd.assignee_handle', 'd.assignee_pane_key')} AS worker
    FROM teams t
    LEFT JOIN dispatch_contexts d ON d.id = (
      SELECT id FROM dispatch_contexts WHERE task_id = NEW.id ORDER BY rowid DESC LIMIT 1)
    WHERE t.run_id = NEW.run_id
  ) x;
END;

CREATE TRIGGER trg_team_activity_dispatch_status
AFTER UPDATE OF status ON dispatch_contexts
WHEN NEW.status <> OLD.status
  AND (NEW.status = 'dispatched' OR (OLD.status = 'pending' AND NEW.status IN ('failed', 'circuit_broken')))
  AND EXISTS (SELECT 1 FROM teams WHERE run_id = NEW.run_id)
BEGIN
  ${DISPATCH_ACTIVITY_INSERT_SQL}
END;

-- A context-only dispatch is inserted already dispatched, so no status update ever fires for it.
CREATE TRIGGER trg_team_activity_dispatch_insert
AFTER INSERT ON dispatch_contexts
WHEN NEW.status = 'dispatched' AND EXISTS (SELECT 1 FROM teams WHERE run_id = NEW.run_id)
BEGIN
  ${DISPATCH_ACTIVITY_INSERT_SQL}
END;

CREATE TRIGGER trg_team_activity_member_insert
AFTER INSERT ON team_members
BEGIN
  INSERT INTO team_activity (team_id, kind, from_party, to_party, to_member_id, subject)
  VALUES (NEW.team_id, 'member_added', 'operator', 'member', NEW.id, NEW.display_name);
END;

CREATE TRIGGER trg_team_activity_member_state
AFTER UPDATE OF desired_state ON team_members
WHEN NEW.desired_state <> OLD.desired_state
BEGIN
  INSERT INTO team_activity (team_id, kind, status, from_party, to_party, to_member_id, subject)
  VALUES (NEW.team_id, 'member_state', NEW.desired_state, 'system', 'member', NEW.id,
    NEW.display_name);
END;

CREATE TRIGGER trg_team_activity_member_paused
AFTER UPDATE OF paused_at ON team_members
WHEN (OLD.paused_at IS NULL) <> (NEW.paused_at IS NULL)
BEGIN
  INSERT INTO team_activity (
    team_id, kind, status, from_party, to_party, to_member_id, subject, detail
  )
  VALUES (NEW.team_id,
    CASE WHEN NEW.paused_at IS NULL THEN 'member_resumed' ELSE 'member_paused' END,
    NEW.pause_reason,
    -- A reason means a breaker tripped; the operator's own pause carries none.
    CASE WHEN NEW.paused_at IS NOT NULL AND NEW.pause_reason IS NOT NULL
         AND NEW.pause_reason <> 'operator' THEN 'system' ELSE 'operator' END,
    'member', NEW.id, NEW.display_name, NEW.pause_reason);
END;

CREATE TRIGGER trg_team_activity_hire_proposed
AFTER INSERT ON team_hire_proposals
BEGIN
  INSERT INTO team_activity (
    team_id, kind, status, from_party, from_member_id, to_party, subject, detail
  )
  VALUES (NEW.team_id, 'hire_proposed', NEW.status,
    CASE WHEN NEW.proposed_by_member_id IS NULL THEN 'operator' ELSE 'member' END,
    NEW.proposed_by_member_id, 'operator', NEW.display_name || ' (' || NEW.role_slug || ')',
    NULLIF(substr(NEW.rationale, 1, 280), ''));
END;

CREATE TRIGGER trg_team_activity_hire_decided
AFTER UPDATE OF status ON team_hire_proposals
WHEN NEW.status <> OLD.status
BEGIN
  INSERT INTO team_activity (
    team_id, kind, status, from_party, to_party, to_member_id, subject, detail
  )
  VALUES (NEW.team_id, 'hire_decided', NEW.status, 'operator',
    CASE WHEN NEW.proposed_by_member_id IS NULL THEN 'team' ELSE 'member' END,
    NEW.proposed_by_member_id, NEW.display_name || ' (' || NEW.role_slug || ')',
    NEW.decision_note);
END;

CREATE TRIGGER trg_team_activity_queue_settled
AFTER UPDATE OF delivered_at, failed_reason ON team_member_queue
WHEN (OLD.delivered_at IS NULL AND NEW.delivered_at IS NOT NULL)
  OR (OLD.failed_reason IS NULL AND NEW.failed_reason IS NOT NULL)
BEGIN
  INSERT INTO team_activity (
    team_id, kind, channel, status, from_party, to_party, to_member_id, subject, detail
  )
  SELECT m.team_id, 'delivery', 'queue',
    CASE WHEN NEW.failed_reason IS NOT NULL THEN 'failed' ELSE 'delivered' END,
    CASE
      WHEN NEW.source IN ('operator', 'enrich', 'goal') THEN 'operator'
      WHEN NEW.source LIKE 'webhook%' THEN 'external'
      ELSE 'system'
    END,
    'member', m.id,
    substr(NEW.text, 1, CASE WHEN instr(NEW.text, char(10)) BETWEEN 1 AND 160
      THEN instr(NEW.text, char(10)) - 1 ELSE 160 END),
    COALESCE(NEW.failed_reason, NEW.source)
  FROM team_members m WHERE m.id = NEW.member_id;
END;
`

const TEAM_ACTIVITY_TRIGGER_NAMES = [
  'trg_team_activity_message_insert',
  'trg_team_activity_message_read',
  'trg_team_activity_task_insert',
  'trg_team_activity_task_status',
  'trg_team_activity_dispatch_status',
  'trg_team_activity_dispatch_insert',
  'trg_team_activity_member_insert',
  'trg_team_activity_member_state',
  'trg_team_activity_member_paused',
  'trg_team_activity_hire_proposed',
  'trg_team_activity_hire_decided',
  'trg_team_activity_queue_settled'
] as const

/** Removes the triggers; `migrate` does this first so a table rebuild is never refused by one. */
export function dropTeamActivityTriggers(db: Database.Database): void {
  db.exec(TEAM_ACTIVITY_TRIGGER_NAMES.map((name) => `DROP TRIGGER IF EXISTS ${name};`).join(' '))
}

/**
 * Records every message, task, dispatch, member, hire, and queue change as team activity.
 * Triggers, not store calls, because many writers touch these tables and a feed that misses one
 * is misleading. Dropped and recreated, never left as found, so an older build's version of one
 * cannot linger.
 */
export function createTeamActivityTriggers(db: Database.Database): void {
  // A savepoint, not BEGIN: the first team is created inside a caller's transaction.
  db.exec('SAVEPOINT team_activity_triggers')
  try {
    dropTeamActivityTriggers(db)
    db.exec(TEAM_ACTIVITY_TRIGGERS_SQL)
    db.exec('RELEASE team_activity_triggers')
  } catch (error) {
    db.exec('ROLLBACK TO team_activity_triggers')
    db.exec('RELEASE team_activity_triggers')
    throw error
  }
}

/**
 * Only a database with a team carries the triggers: they name columns on the core tables, and a
 * database that never had a team should not pay for them or be blocked by them on a rebuild.
 */
export function createTeamActivityTriggersIfTeamsExist(db: Database.Database): void {
  if (db.prepare('SELECT 1 FROM teams LIMIT 1').get()) {
    createTeamActivityTriggers(db)
  }
}
