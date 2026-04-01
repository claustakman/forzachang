-- Forza Chang FC — D1 Database Schema
-- Run: wrangler d1 execute forzachang-db --file=database/schema.sql

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player', -- 'player' | 'admin' | 'trainer'
  active INTEGER NOT NULL DEFAULT 1,
  birth_date TEXT,
  shirt_number INTEGER,
  license_number TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  opponent TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT 'home', -- 'home' | 'away'
  address TEXT,
  season TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signups (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'yes', -- 'yes' | 'no'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS stats (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  goals INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  played INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, match_id)
);

CREATE TABLE IF NOT EXISTS fine_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL, -- øre (100 = 1 kr)
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fines (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fine_type_id TEXT NOT NULL REFERENCES fine_types(id),
  amount INTEGER NOT NULL,
  reason TEXT,
  issued_by TEXT NOT NULL REFERENCES players(id),
  paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default fine types
INSERT OR IGNORE INTO fine_types (id, name, amount) VALUES
  ('ft1', 'For sent til kamp', 2000),
  ('ft2', 'Glemt trøje', 5000),
  ('ft3', 'Glemt støvler', 5000),
  ('ft4', 'Rødt kort', 10000),
  ('ft5', 'Gult kort (2. i sæson)', 2500),
  ('ft6', 'Ikke mødt op uden afbud', 5000),
  ('ft7', 'Mobiltelefon på banen', 2000),
  ('ft8', 'Klaget over dommer', 3000);

-- Default admin user (password: admin123 — CHANGE THIS)
-- password_hash is bcrypt of 'admin123'
INSERT OR IGNORE INTO players (id, name, email, password_hash, role) VALUES
  ('admin', 'Admin', 'admin@forzachang.dk', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin');

-- ── Fase 3: Events og tilmeldinger ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'kamp',        -- 'kamp' | 'event'
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TEXT NOT NULL,                  -- ISO 8601
  end_time TEXT,                             -- ISO 8601 (flerdags-events)
  meeting_time TEXT,                         -- ISO 8601
  signup_deadline TEXT,                      -- ISO 8601 (valgfrit)
  status TEXT NOT NULL DEFAULT 'aktiv',      -- 'aktiv' | 'aflyst'
  webcal_uid TEXT UNIQUE,                    -- UID fra iCal-feed (NULL = manuelt)
  season INTEGER NOT NULL,                   -- kalenderår, fx 2025
  result TEXT,                               -- kampresultat, fx '3-1'
  created_by TEXT REFERENCES players(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_signups (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'tilmeldt',   -- 'tilmeldt' | 'afmeldt'
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, player_id)
);

CREATE TABLE IF NOT EXISTS event_organizers (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, player_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_guests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  added_by TEXT NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Migrations (safe to re-run — ignored if column already exists)
-- Run these once against the existing DB via Cloudflare D1 dashboard console:
-- ALTER TABLE players ADD COLUMN birth_date TEXT;
-- ALTER TABLE players ADD COLUMN shirt_number INTEGER;
-- ALTER TABLE players ADD COLUMN license_number TEXT;
-- ALTER TABLE players ADD COLUMN phone TEXT;
-- ALTER TABLE players ADD COLUMN avatar_url TEXT;
