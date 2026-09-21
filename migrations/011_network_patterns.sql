-- Cross-account learning from categories only. No business names, text, URLs,
-- contacts, or numbers are stored here. contributor_id is a random per-account
-- value; deleting an account's rows withdraws its contribution.
CREATE TABLE IF NOT EXISTS network_contributors (
  user_id TEXT PRIMARY KEY,
  contributor_id TEXT NOT NULL UNIQUE,
  sharing INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS network_patterns (
  pattern_ref TEXT PRIMARY KEY,
  contributor_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reviewed_artifact INTEGER NOT NULL,
  observed INTEGER NOT NULL,
  updated_week TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS network_patterns_shape ON network_patterns(kind, channel);
CREATE INDEX IF NOT EXISTS network_patterns_contributor ON network_patterns(contributor_id);
