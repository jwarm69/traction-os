-- One row per business that wants a scheduled performance memo. Owner-only.
-- The tick route reads this table to find due businesses without parsing
-- every business document. Times are UTC. Memos themselves live in the
-- business document, keyed by ISO week, so this table only paces generation.
CREATE TABLE IF NOT EXISTS memo_schedules (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  weekday INTEGER NOT NULL DEFAULT 1 CHECK(weekday BETWEEN 0 AND 6),
  hour_utc INTEGER NOT NULL DEFAULT 7 CHECK(hour_utc BETWEEN 0 AND 23),
  next_due_at TEXT NOT NULL,
  last_generated_week TEXT,
  lease_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, business_id)
);
CREATE INDEX IF NOT EXISTS memo_schedules_due ON memo_schedules(enabled, next_due_at);
