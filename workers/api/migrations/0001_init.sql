-- Settle It global records. Room-local live state lives in each Room Durable Object.

CREATE TABLE IF NOT EXISTS actor (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'guest',
  account_id TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS question (
  id TEXT PRIMARY KEY,
  topic TEXT,
  tags TEXT NOT NULL,
  spoiler INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  note TEXT,
  active_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS question_version (
  version_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question(id),
  version INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  options TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (question_id, version)
);

CREATE TABLE IF NOT EXISTS daily_challenge (
  date_key TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES question_version(version_id),
  opens_at INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  result_version INTEGER NOT NULL DEFAULT 0,
  scheduled_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_attempt (
  date_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  prediction INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  eligible INTEGER NOT NULL DEFAULT 1,
  is_test INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date_key, actor_id)
);

CREATE TABLE IF NOT EXISTS daily_result (
  date_key TEXT NOT NULL,
  result_version INTEGER NOT NULL,
  counts TEXT NOT NULL,
  total INTEGER NOT NULL,
  graded INTEGER NOT NULL,
  cutoff_at INTEGER NOT NULL,
  finalized_at INTEGER NOT NULL,
  note TEXT,
  PRIMARY KEY (date_key, result_version)
);

CREATE TABLE IF NOT EXISTS daily_grade (
  date_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  result_version INTEGER NOT NULL,
  baseline_share REAL,
  score INTEGER,
  status TEXT NOT NULL,
  PRIMARY KEY (date_key, actor_id, result_version)
);

CREATE TABLE IF NOT EXISTS share_token (
  token TEXT PRIMARY KEY,
  date_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS share_token_owner ON share_token(actor_id, date_key);

-- One latest finalized answer per actor and question version across public play.
CREATE TABLE IF NOT EXISTS contribution (
  actor_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (actor_id, version_id)
);
CREATE INDEX IF NOT EXISTS contribution_version ON contribution(version_id, is_test);

CREATE TABLE IF NOT EXISTS round_outcome (
  event_id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  round_id TEXT NOT NULL,
  version_id TEXT,
  variant INTEGER NOT NULL,
  outcome_kind TEXT NOT NULL,
  total INTEGER NOT NULL,
  margin INTEGER NOT NULL,
  changed_minds INTEGER NOT NULL,
  both_votes INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS round_outcome_version ON round_outcome(version_id, completed_at);
CREATE INDEX IF NOT EXISTS round_outcome_time ON round_outcome(completed_at);

CREATE TABLE IF NOT EXISTS room_registry (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  rounds_completed INTEGER NOT NULL DEFAULT 0,
  pending_exports INTEGER NOT NULL DEFAULT 0,
  last_export_at INTEGER,
  last_export_error TEXT,
  is_test INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS room_registry_pending ON room_registry(pending_exports, last_activity_at);

CREATE TABLE IF NOT EXISTS export_receipt (
  event_id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS featured (
  slot TEXT PRIMARY KEY,
  version_id TEXT,
  note TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_event (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  actor_id TEXT,
  session_id TEXT,
  mode TEXT,
  version_id TEXT,
  env TEXT NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  day TEXT NOT NULL,
  props TEXT
);
CREATE INDEX IF NOT EXISTS telemetry_day ON telemetry_event(day, name, is_test);
CREATE INDEX IF NOT EXISTS telemetry_actor_day ON telemetry_event(actor_id, day);
