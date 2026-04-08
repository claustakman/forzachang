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

-- ── Fase 6: Bødekasse ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fine_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,        -- kr. (fx 50 = 50 kr)
  auto_assign TEXT,               -- NULL | 'absence' | 'late_signup'
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fines (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fine_type_id TEXT NOT NULL REFERENCES fine_types(id),
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,        -- kr.
  note TEXT,
  assigned_by TEXT NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, fine_type_id, event_id)
);

CREATE TABLE IF NOT EXISTS fine_payments (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,        -- kr.
  note TEXT,
  registered_by TEXT NOT NULL REFERENCES players(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed bødekatalog
INSERT OR IGNORE INTO fine_types (id, name, amount, auto_assign, active, sort_order) VALUES
  ('ft-red-direct',   'Direkte rødt kort',                    240, NULL,          1,  1),
  ('ft-absence',      'Udeblivelse fra kamp',                 240, NULL,          1,  2),
  ('ft-two-yellows',  'To gule kort i samme kamp',            180, NULL,          1,  3),
  ('ft-no-reply',     'Manglende udmelding til kamp',         160, 'no_signup',   1,  4),
  ('ft-yellow-behav', 'Gult kort for brok eller opførsel',    120, NULL,          1,  5),
  ('ft-matchday-off', 'Afbud på kampdag',                     120, NULL,          1,  6),
  ('ft-late-arrive',  'Fremmøde efter kampstart',             120, NULL,          1,  7),
  ('ft-late-signup',  'For sen udmelding (efter frist)',        80, 'late_signup', 1,  8),
  ('ft-yellow',       'Gult kort',                             60, NULL,          1,  9),
  ('ft-late-show',    'For sent fremmøde',                     60, NULL,          1, 10),
  ('ft-disciplinary', 'Disciplinærstraf',                      60, NULL,          1, 11),
  ('ft-bad-action',   'Elendig aktion (min. 4 stemmer)',       60, NULL,          1, 12),
  ('ft-kenneth',      'Afbud til kamp (Kennethgebyr)',         30, 'absence',     1, 13);

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

CREATE TABLE IF NOT EXISTS login_log (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminder_log (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  type TEXT NOT NULL DEFAULT 'auto',   -- 'auto' | 'manual'
  UNIQUE(event_id, player_id, type)
);

-- ── Fase 5: Kampstatistik og legacy-statistik ────────────────────────────────

CREATE TABLE IF NOT EXISTS match_stats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  goals INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  mom INTEGER NOT NULL DEFAULT 0,          -- 1 = Man of the Match (kun én per kamp)
  played INTEGER NOT NULL DEFAULT 1,       -- 0 = registreret afbud
  late_signup INTEGER NOT NULL DEFAULT 0,  -- 1 = tilmeldt efter tilmeldingsfristen
  absence INTEGER NOT NULL DEFAULT 0,      -- 1 = meldt afbud (afmeldt)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, player_id)
);

CREATE TABLE IF NOT EXISTS player_stats_legacy (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,               -- kalenderår, fx 2007
  matches INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  mom INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  fines_amount INTEGER NOT NULL DEFAULT 0, -- bødebeløb i kr. (kun legacy)
  UNIQUE(player_id, season)
);

-- ── Fase 7: Kommentarer ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_comments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  edited_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comment_reads (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, event_id)
);

-- ── Fase 8: Hædersbevisninger ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS honor_types (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'auto',         -- 'auto' | 'manual'
  threshold_type TEXT,                        -- 'matches' | 'seasons' | 'mom' | 'goals' | NULL
  threshold_value INTEGER,                    -- grænseværdi, fx 100
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_honors (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  honor_type_id TEXT NOT NULL REFERENCES honor_types(id) ON DELETE CASCADE,
  season INTEGER,                             -- NULL for auto, årstal for manuelle
  awarded_by TEXT REFERENCES players(id),    -- NULL for auto-tildelte
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, honor_type_id, season)
);

-- Seed: hædersbevisningskatalog
INSERT OR IGNORE INTO honor_types (id, key, name, type, threshold_type, threshold_value, sort_order) VALUES
  ('ht-kampe-100',   'kampe_100',   '100 kampe',       'auto',   'matches', 100,  1),
  ('ht-kampe-200',   'kampe_200',   '200 kampe',       'auto',   'matches', 200,  2),
  ('ht-saes-5',      'saesoner_5',  '5 sæsoner',       'auto',   'seasons',   5,  3),
  ('ht-saes-10',     'saesoner_10', '10 sæsoner',      'auto',   'seasons',  10,  4),
  ('ht-saes-15',     'saesoner_15', '15 sæsoner',      'auto',   'seasons',  15,  5),
  ('ht-saes-20',     'saesoner_20', '20 sæsoner',      'auto',   'seasons',  20,  6),
  ('ht-mom-10',      'mom_10',      '10 MoM',          'auto',   'mom',      10,  7),
  ('ht-mom-20',      'mom_20',      '20 MoM',          'auto',   'mom',      20,  8),
  ('ht-mom-50',      'mom_50',      '50 MoM',          'auto',   'mom',      50,  9),
  ('ht-maal-50',     'maal_50',     '50 mål',          'auto',   'goals',    50, 10),
  ('ht-maal-100',    'maal_100',    '100 mål',         'auto',   'goals',   100, 11),
  ('ht-maal-150',    'maal_150',    '150 mål',         'auto',   'goals',   150, 12),
  ('ht-spiller',     'spiller',     'Årets spiller',   'manual', NULL,     NULL, 13),
  ('ht-fighter',     'fighter',     'Årets fighter',   'manual', NULL,     NULL, 14),
  ('ht-kammerat',    'kammerat',    'Årets kammerat',  'manual', NULL,     NULL, 15);

-- Migrations (safe to re-run — ignored if column already exists)
-- ALTER TABLE players ADD COLUMN alias TEXT;
-- ALTER TABLE players ADD COLUMN last_seen TEXT;
-- Run these once against the existing DB via Cloudflare D1 dashboard console:
-- ALTER TABLE players ADD COLUMN birth_date TEXT;
-- ALTER TABLE players ADD COLUMN shirt_number INTEGER;
-- ALTER TABLE players ADD COLUMN license_number TEXT;
-- ALTER TABLE players ADD COLUMN phone TEXT;
-- ALTER TABLE players ADD COLUMN avatar_url TEXT;

-- ── Fase 9: PWA + Push-notifikationer ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(endpoint)
);

-- Kør mod prod (én gang):
-- ALTER TABLE players ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE players ADD COLUMN notify_push   INTEGER NOT NULL DEFAULT 1;

-- ── Fase 10: Holdrekorder ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_records (
  id TEXT PRIMARY KEY,
  team_type TEXT NOT NULL CHECK(team_type IN ('oldboys','senior')),
  record_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  context TEXT,
  auto_update INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(team_type, record_key)
);

-- ── Fase 10: Slutstillinger ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS season_standings (
  id TEXT PRIMARY KEY,
  team_type TEXT NOT NULL CHECK(team_type IN ('oldboys','senior')),
  season INTEGER NOT NULL,
  position INTEGER,
  league TEXT,
  played INTEGER,
  won INTEGER,
  drawn INTEGER,
  lost INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  points INTEGER,
  dai_standings_url TEXT,
  imported_at TEXT NOT NULL,
  UNIQUE(team_type, season)
);

-- ── Fase 10: Kamphistorik ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS season_matches (
  id TEXT PRIMARY KEY,
  team_type TEXT NOT NULL CHECK(team_type IN ('oldboys','senior')),
  season INTEGER NOT NULL,
  match_date TEXT,
  opponent TEXT NOT NULL,
  home_away TEXT CHECK(home_away IN ('hjemme','ude')),
  goals_for INTEGER,
  goals_against INTEGER,
  result TEXT CHECK(result IN ('sejr','uafgjort','nederlag')),
  event_id TEXT REFERENCES events(id),
  UNIQUE(team_type, season, match_date, opponent)
);

CREATE INDEX IF NOT EXISTS idx_season_matches_opponent ON season_matches(opponent);
CREATE INDEX IF NOT EXISTS idx_season_matches_season ON season_matches(season, team_type);
CREATE INDEX IF NOT EXISTS idx_season_standings_season ON season_standings(season, team_type);

-- ── Fase 11: Opslagstavle ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS board_posts (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  title TEXT,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  pinned_by TEXT REFERENCES players(id),
  edited_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS board_attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('image','document')),
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS board_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  body TEXT NOT NULL,
  edited_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS board_reads (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_board_posts_created ON board_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_pinned ON board_posts(pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_comments_post ON board_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_board_attachments_post ON board_attachments(post_id);
