CREATE TABLE IF NOT EXISTS ai_budgets (
  id TEXT PRIMARY KEY,
  limit_micros INTEGER NOT NULL CHECK(limit_micros >= 0)
);
INSERT INTO ai_budgets(id,limit_micros) VALUES('public-beta',10000000) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS ai_spend (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES ai_budgets(id),
  user_id TEXT NOT NULL,
  amount_micros INTEGER NOT NULL CHECK(amount_micros >= 0),
  status TEXT NOT NULL CHECK(status IN ('reserved','settled','uncertain')),
  created_at TEXT NOT NULL,
  response_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER
);
CREATE INDEX IF NOT EXISTS ai_spend_budget ON ai_spend(budget_id);
CREATE INDEX IF NOT EXISTS ai_spend_user ON ai_spend(user_id,created_at);
