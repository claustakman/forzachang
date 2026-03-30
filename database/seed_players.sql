-- CFC Spillere seed data
-- Kør med: wrangler d1 execute forzachang-db --file=database/seed_players.sql
-- Kræver at phone-kolonnen er tilføjet først:
--   ALTER TABLE players ADD COLUMN phone TEXT;

-- Aktive spillere (default adgangskode: admin123)
INSERT OR IGNORE INTO players (id, name, email, phone, password_hash, role, active, birth_date, shirt_number) VALUES
  ('thomas.bryrup',       'Thomas Bryrup',       't-bryrup@hotmail.com',         '28727016', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1990-02-21', 1),
  ('casper.sorrig',       'Casper Sørrig',        'capperman@gmail.com',          '61704004', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1979-05-07', 2),
  ('morten.caroe',        'Morten Carøe',         'mortencaroe@hotmail.com',      '51903207', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1982-08-23', 3),
  ('jeppe.dyrberg',       'Jeppe Dyrberg',        'jeppejee@gmail.com',           '30692018', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1982-11-10', 8),
  ('christian.naesby',    'Christian Næsby',      'chr.naesby@gmail.com',         '20781331', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1980-12-06', 9),
  ('morten.ladegaard',    'Morten Ladegaard',     'mortenpetersen78@gmail.com',   '22159288', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1978-09-21', 10),
  ('mikael.strandbygaard','Mikael Strandbygaard', 'strandbygaard84@gmail.com',    '28576901', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'trainer',1, '1984-01-09', 11),
  ('henrik.stein',        'Henrik Stein',         'hkstein2@gmail.com',           '27123080', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1982-03-10', 15),
  ('mathias.elisberg',    'Mathias Elisberg',     'mo.elisberg@gmail.com',        '21213339', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1985-05-17', 17),
  ('andreas.johannsen',   'Andreas Johannsen',    'njohannsen@gmail.com',         '20734290', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1982-07-21', 18),
  ('henrik.kjaersgaard',  'Henrik Kjærsgaard',    'hkc86@outlook.dk',             '28896399', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1986-07-09', 23),
  ('joel.diaz-varela',    'Joel Diaz-Varela',     '',                             '41964853', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, NULL,         25),
  ('rasmus.nissen',       'Rasmus Nissen',        'rallenissen@gmail.com',        '26149431', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 1, '1984-02-10', 27);

-- Passive spillere (kan ikke logge ind, men har brugernavne til historik)
INSERT OR IGNORE INTO players (id, name, password_hash, role, active) VALUES
  ('thomas.andersson',   'Thomas Andersson',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('daniel.bachmann',    'Daniel Bachmann',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('morten.buus',        'Morten Buus',        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('kenneth.christensen','Kenneth Christensen','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('anders.guldborg',    'Anders Guldborg',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('peter.hesselholt',   'Peter Hesselholt',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('jacob.jorgensen',    'Jacob Jørgensen',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('morten.larsen',      'Morten Larsen',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('mads.lybaech',       'Mads Lybæch',        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('morten.lydal',       'Morten Lydal',       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('kristian.nohr',      'Kristian Nøhr',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('soren.nohr',         'Søren Nøhr',         '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('bo.praesius',        'Bo Præsius',         '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('ivar.rosendal',      'Ivar Rosendal',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('morten.sorensen',    'Morten Sørensen',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('peter.tornsberg',    'Peter Tornsberg',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('christian.vendelbo', 'Christian Vendelbo', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0),
  ('jens.zebis',         'Jens Erik Zebis',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'player', 0);
