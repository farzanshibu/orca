/** Activity triggers on the team's own tables: members, hire proposals, and the member queue. */
export const TEAM_ROSTER_ACTIVITY_TRIGGERS_SQL = `
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
