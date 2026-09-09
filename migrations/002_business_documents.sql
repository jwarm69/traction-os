CREATE TABLE IF NOT EXISTS business_documents (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,id)
);
CREATE INDEX IF NOT EXISTS business_documents_recent ON business_documents(user_id,updated_at DESC);
