CREATE TABLE profiles (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL,
  emoji           TEXT NOT NULL,
  pin_hash        TEXT NOT NULL,
  pin_salt        TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE habits (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  emoji         TEXT NOT NULL,
  color         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('boolean', 'quantity')),
  target        REAL NOT NULL DEFAULT 1,
  unit          TEXT NOT NULL DEFAULT '',
  weekdays      INTEGER NOT NULL DEFAULT 127,
  reminder_time TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX habits_profile ON habits(profile_id);
CREATE INDEX habits_reminder ON habits(reminder_time) WHERE reminder_time IS NOT NULL;

CREATE TABLE entries (
  habit_id   TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  value      REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (habit_id, date)
) WITHOUT ROWID;

CREATE TABLE push_subscriptions (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  timezone   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, endpoint)
);
