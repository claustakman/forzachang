-- Forza Chang FC — D1 Database Schema
-- Run: wrangler d1 execute forzachang-db --file=database/schema.sql

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player', -- 'player' | 'admin' | 'treasurer'
  active INTEGER NOT NULL DEFAULT 1,
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
