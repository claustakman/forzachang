-- Holdrekorder — manuelt indsat
-- Kør: wrangler d1 execute forzachang-db --remote --file=database/seed_records.sql

-- ── OLDBOYS ───────────────────────────────────────────────────────────────────

INSERT OR REPLACE INTO team_records (id, team_type, record_key, label, value, context, auto_update, sort_order, updated_at) VALUES
  (lower(hex(randomblob(16))), 'oldboys', 'best_position',        'Bedste placering i en sæson',        '6. plads i A-rækken', '2024',                        0, 1, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'most_points',          'Flest point i en sæson',             '49',                  '2019',                        0, 2, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'best_goal_diff',       'Bedste målscore i en sæson',         '+66',                 '2019',                        0, 3, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'most_goals_scored',    'Flest mål scoret i en sæson',        '91',                  '2019',                        0, 4, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'fewest_goals_against', 'Færrest mål lukket ind i en sæson',  '25',                  '2019',                        0, 5, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'biggest_win',          'Største sejr',                       '14-0',                'mod Lokomotiv KBH, 1/10-2019', 0, 6, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'win_streak',           'Flest kampe i træk med sejr',        '7',                   '18/9-2020 – 7/4-2021',        0, 7, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'unbeaten_streak',      'Flest kampe i træk uden nederlag',   '9',                   '3/6-2019 – 1/10-2019',        0, 8, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'scoring_streak',       'Flest kampe i træk med scoring',     '33',                  '29/10-2019 – 25/10-2021',     0, 9, datetime('now')),
  (lower(hex(randomblob(16))), 'oldboys', 'clean_sheet_streak',   'Flest kampe i træk med clean sheet', '4',                   '18/9-2020 – 7/10-2020',       0, 10, datetime('now'));

-- ── SENIOR ────────────────────────────────────────────────────────────────────

INSERT OR REPLACE INTO team_records (id, team_type, record_key, label, value, context, auto_update, sort_order, updated_at) VALUES
  (lower(hex(randomblob(16))), 'senior', 'best_position',        'Bedste placering i en sæson',        '6. plads i C-rækken', '2011',                        0, 1, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'most_points',          'Flest point i en sæson',             '38',                  '2010',                        0, 2, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'best_goal_diff',       'Bedste målscore i en sæson',         '+8',                  '2010',                        0, 3, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'most_goals_scored',    'Flest mål scoret i en sæson',        '69',                  '2010',                        0, 4, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'fewest_goals_against', 'Færrest mål lukket ind i en sæson',  '51',                  '2017',                        0, 5, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'biggest_win',          'Største sejr',                       '11-0',                'mod FC Sundkrop, 12/5-2007',   0, 6, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'win_streak',           'Flest kampe i træk med sejr',        '3',                   '11/6-2007 – 22/6-2007',       0, 7, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'unbeaten_streak',      'Flest kampe i træk uden nederlag',   '4',                   '15/4-2010 – 11/5-2010',       0, 8, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'scoring_streak',       'Flest kampe i træk med scoring',     '21',                  '15/9-2013 – 21/9-2014',       0, 9, datetime('now')),
  (lower(hex(randomblob(16))), 'senior', 'clean_sheet_streak',   'Flest kampe i træk med clean sheet', '1',                   '12/5-2007',                   0, 10, datetime('now'));
