ALTER TABLE runner_devices ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE runner_jobs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'codex' CHECK(execution_mode IN ('codex','computer'));
ALTER TABLE runner_jobs ADD COLUMN goal TEXT;
