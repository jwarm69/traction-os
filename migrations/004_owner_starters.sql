CREATE TABLE IF NOT EXISTS owner_starters (
  owner_email TEXT NOT NULL,
  business_id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  PRIMARY KEY(owner_email,business_id)
);
