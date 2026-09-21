-- View-only partner access to one business. Owners invite an existing account
-- by username; members never gain access to the owner's other businesses.
CREATE TABLE IF NOT EXISTS business_members (
  owner_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, business_id, member_id)
);
CREATE INDEX IF NOT EXISTS business_members_member ON business_members(member_id);
