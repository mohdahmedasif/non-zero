-- Browsers that have been paired with the admin key. Only these may reach the
-- rest of the API, so strangers cannot see profiles or guess PINs.
CREATE TABLE devices (
  token_hash TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
