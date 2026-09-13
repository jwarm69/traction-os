CREATE TABLE IF NOT EXISTS runner_devices (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL, revoked_at TEXT, last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS runner_devices_owner ON runner_devices(owner_id);
CREATE TABLE IF NOT EXISTS runner_pair_codes (
  code_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE INDEX IF NOT EXISTS runner_pair_codes_expiry ON runner_pair_codes(expires_at, used_at);
CREATE TABLE IF NOT EXISTS runner_jobs (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, business_id TEXT NOT NULL, endeavor_id TEXT NOT NULL,
  device_id TEXT NOT NULL, revision INTEGER NOT NULL, brief TEXT NOT NULL, status TEXT NOT NULL,
  lease_token_hash TEXT, lease_expires_at TEXT, created_at TEXT NOT NULL, claimed_at TEXT,
  completed_at TEXT, result_json TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS runner_jobs_claim ON runner_jobs(device_id, status, created_at);
CREATE TABLE IF NOT EXISTS runner_approvals (
  request_id TEXT NOT NULL, job_id TEXT NOT NULL, owner_id TEXT NOT NULL, method TEXT NOT NULL,
  details_json TEXT NOT NULL, decision TEXT, created_at TEXT NOT NULL, decided_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS runner_approvals_key ON runner_approvals(job_id, request_id);
CREATE INDEX IF NOT EXISTS runner_approvals_job ON runner_approvals(job_id, decision);
