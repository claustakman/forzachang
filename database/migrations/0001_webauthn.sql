CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  public_key_spki TEXT NOT NULL,
  algorithm       INTEGER NOT NULL DEFAULT -7,
  counter         INTEGER NOT NULL DEFAULT 0,
  transports      TEXT NOT NULL DEFAULT '[]',
  device_name     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at    TEXT
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES players(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
