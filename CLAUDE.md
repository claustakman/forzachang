# Copenhagen Forza Chang — CLAUDE.md

App til tilmelding, statistik og bødekasse for Copenhagen Forza Chang (CFC).
Live på: https://forzachang.pages.dev

---

## Stack

| Lag       | Teknologi                        |
|-----------|----------------------------------|
| Frontend  | React + Vite → Cloudflare Pages  |
| API       | Cloudflare Workers (TypeScript)  |
| Database  | Cloudflare D1 (SQLite)           |
| Storage   | Cloudflare R2 (avatarbilleder)   |
| Email     | Resend                           |
| CI/CD     | GitHub Actions                   |

---

## Mappestruktur

```
forzachang/
├── database/
│   ├── schema.sql              # D1 database schema + seed data
│   ├── seed_standings.sql      # Historiske stillinger + kampresultater (genereret af scrape_standings.py)
│   ├── seed_records.sql        # Holdrekorder (manuelt indsat)
│   ├── seed_stats.sql          # Historisk spillerstatistik (genereret af scrape_stats.py)
│   └── seed_honors.sql         # Historiske hædersbevisninger (genereret af scrape_honors.py)
├── worker/                     # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts            # Router + scheduled jobs (webcal-sync + reminders)
│   │   ├── lib/auth.ts         # JWT + password helpers
│   │   ├── lib/webpush.ts      # Web Push Protocol (RFC 8030/8291/8292) via crypto.subtle
│   │   ├── lib/sendPush.ts     # Fan-out helper: send push til én spiller (alle enheder)
│   │   └── routes/
│   │       ├── auth.ts
│   │       ├── players.ts      # Inkl. POST /:id/avatar → R2, notify_email/notify_push
│   │       ├── events.ts       # Events + tilmeldinger + gæster + påmindelser
│   │       ├── settings.ts     # App-indstillinger (webcal URL m.m.)
│   │       ├── matches.ts      # Gamle kampe (legacy)
│   │       ├── signups.ts      # Gamle tilmeldinger (legacy)
│   │       ├── stats.ts
│   │       ├── fines.ts
│   │       ├── comments.ts     # Kommentarer (fase 7) + @-mention push
│   │       ├── honors.ts       # Hædersbevisninger (fase 8)
│   │       ├── push.ts         # Push-subscriptions + VAPID public key (fase 9)
│   │       ├── board.ts        # Opslagstavle: opslag, kommentarer, vedhæftninger (fase 11)
│   │       ├── votes.ts        # Kampens Spiller afstemning (fase 12)
│   │       ├── records.ts      # Holdrekorder
│   │       └── standings.ts    # Sæsonstillinger + kamphistorik
│   └── wrangler.toml
├── frontend/                   # React app
│   ├── public/
│   │   ├── manifest.json       # PWA manifest
│   │   ├── sw.js               # Service worker (push + offline-cache)
│   │   ├── icon-192.png        # App-ikon 192x192
│   │   └── icon-512.png        # App-ikon 512x512
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts          # API client (BASE_URL skifter prod/dev)
│   │   │   ├── auth.tsx        # Auth context (JWT i localStorage)
│   │   │   └── push.ts         # Browser-side push-subscription helpers
│   │   ├── components/
│   │   │   ├── Layout.tsx      # Navigation shell
│   │   │   └── PwaBanner.tsx   # Installationsbanner (iOS/Android instruktioner)
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Matches.tsx     # Kalender: events + tilmeldinger (rutet som /kalender)
│   │       ├── Board.tsx       # Opslagstavle: opslag, kommentarer, vedhæftninger (fase 11)
│   │       ├── Historie.tsx    # Historie: Spillerhistorik + Holdhistorik (fase 10)
│   │       ├── Stats.tsx       # (bibeholdt, brugt internt af Historie.tsx)
│   │       ├── Haeder.tsx      # (bibeholdt, brugt internt af Historie.tsx)
│   │       ├── Fines.tsx       # Bødekasse + Bødekatalog-fane
│   │       ├── Admin.tsx       # Spillere + indstillinger (tabs: players, settings) + Licensliste
│   │       ├── Afstemning.tsx  # Kampens Spiller afstemning (fase 12)
│   │       └── Profile.tsx     # Profil inkl. avatar-upload + notifikationsindstillinger
│   └── vite.config.ts
├── scripts/
│   ├── scrape_stats.py         # Scraper historisk statistik fra forzachang.dk → seed SQL
│   ├── scrape_honors.py        # Scraper hædersbevisninger fra forzachang.dk → seed SQL
│   └── scrape_standings.py     # Scraper historiske stillinger + kampresultater → seed SQL
└── .github/workflows/
    ├── deploy.yml              # CI/CD: auto-deploy + DB-migrationer ved push til main
    └── migrate.yml             # Manuel workflow til DB-migrationer
```

---

## Roller

| Rolle     | Rettigheder                                                                    |
|-----------|--------------------------------------------------------------------------------|
| `player`  | Se kampe/events, tilmelde sig, se statistik og bøder, redigere egen profil    |
| `trainer` | Alt ovenstående + oprette/redigere events, føre statistik, give bøder, sende påmindelser |
| `admin`   | Alt + oprette/redigere spillere, tildele roller, webcal-indstillinger          |

---

## Datamodel

### Spiller (`players`)

| Felt             | Type    | Beskrivelse                                        |
|------------------|---------|----------------------------------------------------|
| `id`             | TEXT    | UUID (bruges også som login-brugernavn)            |
| `name`           | TEXT    | Fulde navn                                         |
| `alias`          | TEXT    | Kaldenavn — vises i stedet for fuldt navn i frontend  |
| `birth_date`     | TEXT    | Fødselsdato (ISO 8601)                             |
| `email`          | TEXT    | Email                                              |
| `phone`          | TEXT    | Telefonnummer                                      |
| `shirt_number`   | INTEGER | Trøjenummer                                        |
| `license_number` | TEXT    | DAI licensnummer                                   |
| `avatar_url`     | TEXT    | URL til profilbillede i R2                         |
| `active`         | INTEGER | 1 = aktiv, 0 = pensioneret                         |
| `role`           | TEXT    | `player`, `trainer` eller `admin`                  |
| `last_seen`      | TEXT    | Tidsstempel for seneste API-kald (auto-opdateret)  |
| `created_at`     | TEXT    | Oprettelsestidspunkt                               |

### Events (`events`)

| Felt              | Type    | Beskrivelse                                      |
|-------------------|---------|--------------------------------------------------|
| `id`              | TEXT    | UUID                                             |
| `type`            | TEXT    | `kamp` eller `event`                             |
| `title`           | TEXT    | Titel (kampe: modstandernavn, events: eventnavn) |
| `description`     | TEXT    | Beskrivelse (primært events)                     |
| `location`        | TEXT    | Sted                                             |
| `start_time`      | TEXT    | Starttidspunkt (ISO 8601)                        |
| `end_time`        | TEXT    | Sluttidspunkt (til flerdags-events)              |
| `meeting_time`    | TEXT    | Mødetid (ISO 8601)                               |
| `signup_deadline` | TEXT    | Tilmeldingsfrist (ISO 8601, valgfrit)            |
| `status`          | TEXT    | `aktiv` eller `aflyst`                           |
| `webcal_uid`      | TEXT    | UID fra iCal-feed (NULL for manuelle events)     |
| `season`          | INTEGER | Kalenderår, fx `2025`                            |
| `result`          | TEXT    | Kampresultat, fx `3-1` (kun kampe)               |
| `created_by`      | TEXT    | FK → players.id                                  |
| `created_at`      | TEXT    | Oprettelsestidspunkt                             |

### Tilmeldinger (`event_signups`)

| Felt         | Type | Beskrivelse                                       |
|--------------|------|---------------------------------------------------|
| `id`         | TEXT | UUID                                              |
| `event_id`   | TEXT | FK → events.id                                    |
| `player_id`  | TEXT | FK → players.id                                   |
| `status`     | TEXT | `tilmeldt` eller `afmeldt`                        |
| `message`    | TEXT | Valgfri besked, fx "kommer 30 min for sent"       |
| `created_at` | TEXT | Tidsstempel for seneste ændring                   |

### Arrangører (`event_organizers`)

| Felt        | Type | Beskrivelse       |
|-------------|------|-------------------|
| `event_id`  | TEXT | FK → events.id    |
| `player_id` | TEXT | FK → players.id   |

### App-indstillinger (`app_settings`)

| Felt         | Type | Beskrivelse                        |
|--------------|------|------------------------------------|
| `key`        | TEXT | Nøgle, fx `webcal_url`             |
| `value`      | TEXT | Værdi                              |
| `updated_at` | TEXT | Tidsstempel                        |

Kendte nøgler:

| Nøgle                   | Default | Beskrivelse                                                   |
|-------------------------|---------|---------------------------------------------------------------|
| `webcal_url`            | —       | URL til iCal-feed (webcal:// eller https://)                  |
| `signup_deadline_days`  | `5`     | Dage før kampstart tilmeldingsfristen sættes (webcal + opret) |
| `reminder_days_before`  | `7`     | Dage før start der sendes første auto-påmindelse              |
| `comment_cutoff_hours`  | `24`    | Timer før start "Tilføj kommentar" lukkes på tilmeldingen     |

### Gæster (`event_guests`)

| Felt         | Type | Beskrivelse                          |
|--------------|------|--------------------------------------|
| `id`         | TEXT | UUID                                 |
| `event_id`   | TEXT | FK → events.id                       |
| `name`       | TEXT | Gæstens navn                         |
| `added_by`   | TEXT | FK → players.id (trainer/admin)      |
| `created_at` | TEXT | Oprettelsestidspunkt                 |

Gæster tæller med i `signup_count`, vises i tilmeldingslisten, men har ingen bruger og tæller ikke i statistik eller bøder.

### Login-log (`login_log`)

| Felt         | Type | Beskrivelse                          |
|--------------|------|--------------------------------------|
| `id`         | TEXT | UUID                                 |
| `player_id`  | TEXT | FK → players.id                      |
| `ip`         | TEXT | IP-adresse (CF-Connecting-IP)        |
| `created_at` | TEXT | Tidsstempel for login                |

### Påmindelses-log (`reminder_log`)

| Felt         | Type | Beskrivelse                          |
|--------------|------|--------------------------------------|
| `id`         | TEXT | UUID                                 |
| `event_id`   | TEXT | FK → events.id                       |
| `player_id`  | TEXT | FK → players.id                      |
| `sent_at`    | TEXT | Tidsstempel                          |
| `type`       | TEXT | `auto` eller `manual`                |

UNIQUE constraint på `(event_id, player_id, type)` — forhindrer duplikate påmindelser per type.

### Kampstatistik (`match_stats`)

| Felt           | Type    | Beskrivelse                                   |
|----------------|---------|-----------------------------------------------|
| `id`           | TEXT    | UUID                                          |
| `event_id`     | TEXT    | FK → events.id (kun type=kamp)                |
| `player_id`    | TEXT    | FK → players.id                               |
| `goals`        | INTEGER | Mål scoret                                    |
| `yellow_cards` | INTEGER | Gule kort                                     |
| `red_cards`    | INTEGER | Røde kort                                     |
| `mom`          | INTEGER | 1 = Man of the Match (kun én per kamp)        |
| `played`       | INTEGER | 1 = spillede, 0 = afbud                       |
| `late_signup`  | INTEGER | 1 = tilmeldt efter tilmeldingsfristen          |
| `absence`      | INTEGER | 1 = meldt afbud (afmeldt)                      |
| `no_signup`    | INTEGER | 1 = slet ikke reageret (hverken til- eller afmeldt) |
| `created_at`   | TEXT    | Oprettelsestidspunkt                          |

UNIQUE constraint på `(event_id, player_id)`.

### Legacy-statistik (`player_stats_legacy`)

| Felt           | Type    | Beskrivelse                                   |
|----------------|---------|-----------------------------------------------|
| `id`           | TEXT    | UUID                                          |
| `player_id`    | TEXT    | FK → players.id                               |
| `season`       | INTEGER | Kalenderår, fx `2007`                         |
| `matches`      | INTEGER | Kampe                                         |
| `goals`        | INTEGER | Mål                                           |
| `mom`          | INTEGER | Man of the Match                              |
| `yellow_cards` | INTEGER | Gule kort                                     |
| `red_cards`    | INTEGER | Røde kort                                     |
| `fines_amount` | INTEGER | Bødebeløb i kr. (kun legacy)                  |

UNIQUE constraint på `(player_id, season)`. Moderne `match_stats` vinder over legacy for samme sæson.

### Bødekatalog (`fine_types`)

| Felt          | Type    | Beskrivelse                                              |
|---------------|---------|----------------------------------------------------------|
| `id`          | TEXT    | UUID                                                     |
| `name`        | TEXT    | Navn, fx "Gult kort"                                     |
| `amount`      | INTEGER | Beløb i kr.                                              |
| `auto_assign` | TEXT    | `absence`, `late_signup`, `no_signup` eller NULL         |
| `active`      | INTEGER | 1 = vises i katalog, 0 = arkiveret                       |
| `sort_order`  | INTEGER | Rækkefølge i UI                                          |
| `created_at`  | TEXT    | Oprettelsestidspunkt                                     |

Bødekatalog sorteres stigende efter `amount`, derefter `sort_order`, derefter `name`.

Bødekatalog (13 typer — vises under Bødekasse → Bødekatalog, administreres af admin):

| Navn | Beløb | auto_assign |
|------|-------|-------------|
| Afbud til kamp (Kennethgebyr) | 30 kr | `absence` |
| For sen udmelding (efter frist) | 80 kr | `late_signup` |
| Gult kort | 60 kr | — |
| For sent fremmøde | 60 kr | — |
| Disciplinærstraf | 60 kr | — |
| Elendig aktion (min. 4 stemmer) | 60 kr | — |
| Gult kort for brok eller opførsel | 120 kr | — |
| Afbud på kampdag | 120 kr | — |
| Fremmøde efter kampstart | 120 kr | — |
| Manglende udmelding til kamp | 160 kr | `no_signup` |
| To gule kort i samme kamp | 180 kr | — |
| Direkte rødt kort | 240 kr | — |
| Udeblivelse fra kamp | 240 kr | — |

### Tildelte bøder (`fines`)

| Felt            | Type    | Beskrivelse                                          |
|-----------------|---------|------------------------------------------------------|
| `id`            | TEXT    | UUID                                                 |
| `player_id`     | TEXT    | FK → players.id                                      |
| `fine_type_id`  | TEXT    | FK → fine_types.id                                   |
| `event_id`      | TEXT    | FK → events.id (valgfrit — NULL for manuelle bøder)  |
| `amount`        | INTEGER | Snapshot af beløb på tildelingstidspunkt             |
| `note`          | TEXT    | Valgfri kommentar                                    |
| `assigned_by`   | TEXT    | FK → players.id                                      |
| `created_at`    | TEXT    | Oprettelsestidspunkt                                 |

UNIQUE constraint på `(player_id, fine_type_id, event_id)` — forhindrer duplikate auto-bøder per kamp.

### Indbetalinger (`fine_payments`)

| Felt              | Type    | Beskrivelse                        |
|-------------------|---------|------------------------------------|
| `id`              | TEXT    | UUID                               |
| `player_id`       | TEXT    | FK → players.id                    |
| `amount`          | INTEGER | Indbetalt beløb i kr.              |
| `note`            | TEXT    | Valgfri kommentar                  |
| `registered_by`   | TEXT    | FK → players.id (admin/træner)     |
| `created_at`      | TEXT    | Tidsstempel                        |

### Push-subscriptions (`push_subscriptions` tabel)

| Felt         | Type | Beskrivelse                                  |
|--------------|------|----------------------------------------------|
| `id`         | TEXT | UUID                                         |
| `player_id`  | TEXT | FK → players.id                              |
| `endpoint`   | TEXT | Push-endpoint URL (UNIQUE)                   |
| `p256dh`     | TEXT | Klientens ECDH public key (base64url)        |
| `auth`       | TEXT | Auth secret (base64url)                      |
| `user_agent` | TEXT | Browser/enhed                                |
| `created_at` | TEXT | Oprettelsestidspunkt                         |

### Notifikationsindstillinger på spillere (`players`-kolonner)

| Felt            | Type    | Beskrivelse                      |
|-----------------|---------|----------------------------------|
| `notify_email`  | INTEGER | 1 = modtag email-påmindelser (default) |
| `notify_push`   | INTEGER | 1 = modtag push-notifikationer (default) |

### Legacy-tabeller (bruges stadig til gammel statistik-integration)
- `matches` — gamle kampe (bruges af stats-integration)
- `signups` — gamle tilmeldinger
- `stats` — gammelt stats-format (legacy, erstattes af match_stats)

---

## Regler

- Alle brugere er spillere, men ikke alle spillere har en bruger
- Når en spiller sættes til pensioneret (`active=0`) → kan de ikke logge ind
- Velkomst-email sendes **manuelt** af admin (knap på spillerkortet) — ikke automatisk ved oprettelse
- Password reset sker via email-link (Resend) → `/reset?token=XYZ`

### Admin-brugeren (id = 'admin')
- Systembrugeren med id `'admin'` og navn `'Admin'` er udelukkende til administration
- Filtreres fra overalt i UI: tilmeldingslister, bødeoversigt, statistik, påmindelser
- Filtrering sker på `p.id != 'admin'` (ikke på rolle) — spillere med rollen `admin` vises normalt
- Gælder i: `event_signups`-lister, `signup_count`, `fines/summary`, `match_stats`-queries, auto-reminder-cron

### Profilbilleder (R2)
- Upload via `POST /api/players/:id/avatar` med raw image body
- Gemmes i R2-bucket `forzachang-avatars` under nøglen `avatars/{id}.{ext}`
- Public URL: `https://pub-afc843d1587d4ae3a4aa8f3d76547493.r2.dev/avatars/{id}.{ext}`
- Maks. 5 MB, kun JPG/PNG/WebP

### Alias
- Spillere kan sætte alias på egen profil (Min profil → Oplysninger)
- Admin kan sætte alias i Admin → Spillere → Rediger
- `displayName(p)` helper i `api.ts` returnerer `alias ?? fuldt navn`
- Backend bruger `COALESCE(p.alias, p.name)` i alle JOIN-queries (events, stats, fines)
- Alias er rent kosmetisk — tilmeldinger og statistik er altid gemt på `player_id`

### Aktivitet / last_seen
- `players.last_seen` opdateres automatisk ved hvert authenticated API-kald (fire-and-forget)
- Vises i Admin → Spillere → fold ud → "Sidst aktiv: ..."
- Login-log (`login_log`) gemmer tidsstempel + IP ved hvert succesfuldt login
- Admin kan se seneste 50 logins pr. spiller via "🕐 Aktivitet"-knappen

### Webcal-sync
- Admin angiver webcal-URL under Admin → Indstillinger
- Worker cron-job kører dagligt kl. 09:00 UTC
- Sync-logik: tilføj nye, opdater ændrede, markér slettede som `aflyst`
- Baseret på `webcal_uid` (iCal UID-felt)
- Nye events fra webcal får automatisk: `meeting_time = start − 40 min`, `signup_deadline = start − N dage` (N = `signup_deadline_days`-setting, default 5)
- Alle webcal-events sættes altid til type `kamp`
- Manuel trigger: "Synkroniser nu"-knap under Admin → Indstillinger (kalder `POST /api/settings/sync`)

#### Score-parsing fra iCal SUMMARY
- DAI-sport skriver score ind i SUMMARY når kampen er spillet, fx `Cosa Nostra - CFC 1 - 2`
- `parseSummary()` i `index.ts` udtrækker score med regex `^(.+?)\s+(\d+)\s*-\s*(\d+)\s*$`
- Resulterer i: `title = "Cosa Nostra - CFC"`, `result = "1-2"`
- Titlen på eventet gemmes **uden** score (kun holdnavne)
- Manuelt sat `result` overskrives ikke af webcal-sync hvis webcal ikke har score

#### Automatisk kamphistorik → season_matches
- Når webcal leverer et resultat, gemmes det på eventet og `syncEventToSeasonMatches()` kaldes
- Sker også ved `PUT /api/events/:id` hvis `result` opdateres manuelt
- Hjemme/ude: `CFC - Modstander` → `hjemme`, `Modstander - CFC` → `ude`
- Modstander udtrækkes fra titel ved at fjerne "CFC"-delen
- Upsert på `(team_type, season, match_date, opponent)` — idempotent
- team_type sættes altid til `oldboys` (CFC har kun ét hold)

### Kampstatistik & Bøder (fase 5+6)
- Trainer/admin åbner "📊 Statistik & Bøder" via event-detaljemodal (synlig fra kampdagen og frem)
- Knappen har sin egen fuldbred-række over Rediger/Luk/Påmind
- **Statistik-sektion**: tilmeldte spillere med inputfelter: mål, gule, røde, MoM (radio — kun én per kamp), spillet (checkbox)
- **Auto-udfyld statistik**: played=1 for tilmeldte, late_signup=1 for sent tilmeldte, absence=1 for afmeldte, no_signup=1 for spillere uden nogen reaktion
- **Tre lister** (read-only): Afbud (afmeldte) + Ikke meldt ud (gul overskrift, alle aktive spillere uden signup)
- **Bøde-sektion** under statistikken: foldbare sektioner per bødetype med checkboxes per spiller
  - Auto-bødetyper (`absence`, `late_signup`, `no_signup`) folder automatisk ud og pre-selecterer relevante spillere
  - Manuelle bødetyper: kamprelaterede bøder vises øverst (`For sent fremmøde`, `Fremmøde efter kampstart`, `Afbud på kampdag`, `Udeblivelse fra kamp`), derefter resten
  - Alle manuelle bødetyper starter lukkede
- **Fravalg af auto-bøder**: Trainer kan fjerne flueben for en spiller i en auto-bødetype — frontend sender `skipped_auto_fines: { [fine_type_id]: player_id[] }` med i stats-kaldet, og server springer de fravalgte over
- **Gem**: statistik → `POST /api/stats` (auto-bøder tildeles server-side minus fravalgte), manuelle bøder → `POST /api/fines` per tjekket spiller
- UNIQUE constraint på `(player_id, fine_type_id, event_id)` forhindrer duplikate bøder
- Slet kamp: lukker begge modaler og sender brugeren tilbage til kalenderlisten
- **Statistiksiden** kombinerer `match_stats` og `player_stats_legacy`:
  - Moderne data (`match_stats`) vinder over legacy for samme sæson/spiller
  - Tre visninger: **Sæsonoversigt** (default, tabel inkl. bøder, filtreret på seneste sæson), **Top 10** (6 søjlediagrammer inkl. røde kort og bøder), **Spillerprofil** (klik → modal med sæson-for-sæson inkl. bøder)
  - Default sæsonfilter: indeværende år (fx 2026) — kan ændres til andre sæsoner eller "Alle sæsoner"
  - Filtre: sæson, aktiv/pensionerede/alle, fritekst-søgning
  - Spillerprofil-header viser avatar + alias (hvis sat) eller fuldt navn
  - På mobil (< 600px) vises et gult banner "Vend skærmen for bedre visning" ved Sæsonoversigt og Spillerprofil

### Bødekasse (fase 6)
- **Saldi beregnes dynamisk**: skyldig = SUM(fines.amount) − SUM(fine_payments.amount)
- **Holdoversigt viser "Udestående bøder"** (ikke "Holdets skyldig")
- **Bødeoversigt viser fulde navn eller alias** (ikke kun fornavn) — `alias?.trim() || name`
- **Automatisk tildeling** sker server-side ved gem af kampstatistik via `auto_assign`-feltet på bødetypen:
  - `absence` → tildeles spillere med `absence=1` (afmeldte)
  - `late_signup` → tildeles spillere med `late_signup=1` (tilmeldt efter frist)
  - `no_signup` → tildeles spillere der slet ikke har reageret (hverken tilmeldt eller afmeldt)
  - Trainer kan fraville auto-bøder per spiller i UI'et — fravalgte springes over server-side
- **Manuelle bøder** tildeles af trainer/admin — enten fra Statistik & Bøder-modalen eller direkte fra Bødekassen
- **Bødeside** (`/bøder`): holdoversigt (total skyldig + total bøder), spillertabel (klik → detaljemodal), detaljemodal med bøder/indbetalinger-tabs
- **Bødeside → Bødekatalog-fane**: liste over bødetyper synlig for alle; opret/rediger/arkivér kun for admin; auto_assign-typer markeret med badge
- Alle kan se alles bøder og saldi

### Import af historisk statistik
- Script: `scripts/scrape_stats.py` — scraper forzachang.dk og genererer INSERT-SQL til `player_stats_legacy`
- Kør: `python3 scripts/scrape_stats.py > database/seed_stats.sql`
- Erstat `OLD_ID_X` placeholders med rigtige UUIDs fra `players`-tabellen
- Kør mod prod: `wrangler d1 execute forzachang-db --remote --file=database/seed_stats.sql`
- Kræver: `pip install requests beautifulsoup4`

### Import af historiske hædersbevisninger
- Script: `scripts/scrape_honors.py` — scraper forzachang.dk spillersider for pokalbilleder og årstal
- Kør: `python3 scripts/scrape_honors.py` → genererer `database/seed_honors.sql`
- Tjek efter `MANGLER_ÅRSTAL`-kommentarer i den genererede fil og udfyld manuelt
- Kør mod prod: `wrangler d1 execute forzachang-db --remote --file=database/seed_honors.sql`
- Kræver: `pip install requests beautifulsoup4`

### Import af historiske stillinger og kampresultater
- Script: `scripts/scrape_standings.py` — scraper forzachang.dk for stillinger og kampprogram/resultater
- Kør: `python3 scripts/scrape_standings.py 2>/dev/null > database/seed_standings.sql`
- Kør mod prod: `wrangler d1 execute forzachang-db --remote --file=database/seed_standings.sql`
- Kræver: `pip install requests beautifulsoup4`
- Dækker senior 2007–2018, oldboys 2019–2025
- CFC kendes under flere navne: `cfc`, `forza chang`, `copenhagen forza chang`, `cph. forza chang`
- Scorer parses med `\d+\s*[-–]\s*\d+` (tillader mellemrum fra `&nbsp;-&nbsp;`-format)
- Bruger `INSERT OR REPLACE` for kampe (så resultater overskrives ved gen-kørsel)

### Holdrekorder (manuelt vedligehold)
- Data i `team_records`-tabellen — se `database/seed_records.sql`
- Rediger via Admin UI eller direkte med wrangler:
  ```bash
  wrangler d1 execute forzachang-db --remote --command "UPDATE team_records SET value='...', context='...' WHERE team_type='oldboys' AND record_key='biggest_win'"
  ```
- `auto_update = 0` for alle manuelt vedligeholdte rekorder

### Påmindelser (fase 4)
- **Automatiske** (cron, dagligt kl. 09:00 UTC) — to vinduer:
  - **N dage før start**: sender påmindelse til spillere der ikke har reageret (N = `reminder_days_before`-setting, default 7)
  - **På fristdagen**: sender påmindelse på selve `signup_deadline`-datoen til spillere der stadig ikke har reageret
  - Deduplikerer: hvis et event rammer begge vinduer samme dag, sendes kun én påmindelse
  - Kun aktive spillere med `notify_email=1` der ikke har tilmeldt/afmeldt sig (ekskl. id='admin')
  - Sendes kun én gang per spiller per event (logges i `reminder_log` med `type='auto'`)
- **Manuelle** (trainer/admin via "🔔 Påmind"-knap i event-detaljeview):
  - Viser liste over spillere der ikke har meldt ud — med checkboxes
  - Sender direkte, ingen bekræftelsesdialog
  - Logges i `reminder_log` med `type='manual'` (kan sendes igen)
- Email-afsender: `noreply@forzachang.eu` (verificeret domæne via Resend)
- Email indeholder: link til `/kalender?filter=manglende`
- Logo-fil til email: `frontend/public/logo-email.jpg`

---

## Lokalt udviklingsmiljø

### Forudsætninger
- Node.js (https://nodejs.org)
- Wrangler CLI: `npm install -g wrangler`

### Kør worker lokalt
```bash
cd worker
npm install
npm run dev
```

### Kør frontend lokalt
```bash
cd frontend
npm install
npm run dev
# Proxyer /api → localhost Worker via vite.config.ts
```

---

## Deploy

### Manuel deploy
```bash
# Worker
cd worker && npm run deploy

# Frontend
cd frontend && npm run build
wrangler pages deploy dist --project-name=forzachang
```

### Automatisk (GitHub Actions)
Push til `main` deployer automatisk både worker og frontend, og kører DB-migrationer.

Kræver følgende GitHub Secrets:
- `CLOUDFLARE_API_TOKEN` (skal have Pages Edit + Workers + R2 + D1 rettigheder)
- `CLOUDFLARE_ACCOUNT_ID`

---

## Database

```bash
# Kør schema mod prod
wrangler d1 execute forzachang-db --remote --file=database/schema.sql

# Kør en query mod prod
wrangler d1 execute forzachang-db --remote --command "SELECT * FROM events;"

# Kør lokalt (dev)
wrangler d1 execute forzachang-db --local --file=database/schema.sql
```

---

## Secrets (Worker environment)

```bash
wrangler secret put JWT_SECRET       # Lang tilfældig streng
wrangler secret put RESEND_API_KEY   # Fra resend.com
```

---

## API-struktur (Worker routes)

| Method | Path                                    | Rolle          | Beskrivelse                                      |
|--------|-----------------------------------------|----------------|--------------------------------------------------|
| POST   | /api/auth/login                         | Alle           | Login, returnerer JWT                            |
| GET    | /api/players                            | admin          | Liste over spillere                              |
| POST   | /api/players                            | admin          | Opret spiller                                    |
| PUT    | /api/players/:id                        | self/admin     | Opdater spiller                                  |
| POST   | /api/players/:id/avatar                 | self/admin     | Upload profilbillede til R2                      |
| GET    | /api/players/:id/logins                 | admin          | Seneste 50 logins for spiller                    |
| GET    | /api/events                             | player+        | Liste over events (med filtre)                   |
| GET    | /api/events/:id                         | player+        | Detaljer inkl. tilmeldinger (ekskl. id='admin')  |
| POST   | /api/events                             | trainer+       | Opret event                                      |
| PUT    | /api/events/:id                         | trainer+/arrangør | Rediger event                                 |
| DELETE | /api/events/:id                         | trainer+       | Slet event                                       |
| POST   | /api/events/:id/signup                  | player+        | Tilmeld/afmeld fra event (body: status, message?, player_id?) |
| DELETE | /api/events/:id/signup                  | player+        | Annullér tilmelding (?player_id= for trainer-proxy) |
| POST   | /api/events/:id/guests                  | trainer+       | Tilføj gæst til event                            |
| DELETE | /api/events/:id/guests/:gid             | trainer+       | Fjern gæst fra event                             |
| POST   | /api/events/:id/remind                  | trainer+       | Send manuelle påmindelser (body: player_ids[])   |
| GET    | /api/events/:id/stats                   | trainer+       | Hent kampstatistik + tilmeldte spillere          |
| POST   | /api/stats                              | trainer+       | Gem kampstatistik (body: event_id, rows[])       |
| GET    | /api/settings                           | admin          | Hent app-indstillinger                           |
| PUT    | /api/settings                           | admin          | Gem app-indstillinger                            |
| POST   | /api/settings/sync                      | admin          | Manuel webcal-sync                               |
| POST   | /api/settings/bulk-deadlines            | admin          | Bulk-opdater signup_deadline på alle kommende kampe (body: days) |
| GET    | /api/matches                            | player+        | Legacy: liste over kampe                         |
| POST   | /api/matches                            | admin          | Legacy: opret kamp                               |
| POST   | /api/signups                            | player+        | Legacy: tilmeld/afmeld kamp                      |
| GET    | /api/stats                              | player+        | Hent samlet statistik (legacy + match_stats kombineret) |
| GET    | /api/fine-types                         | player+        | Liste over bødetyper (sorteret stigende efter beløb) |
| POST   | /api/fine-types                         | admin          | Opret bødetype                                   |
| PUT    | /api/fine-types/:id                     | admin          | Rediger bødetype                                 |
| DELETE | /api/fine-types/:id                     | admin          | Arkivér bødetype (active=0)                      |
| GET    | /api/fines                              | player+        | Alle bøder (?player_id= filter)                  |
| GET    | /api/fines/summary                      | player+        | Per-spiller aggregering (ekskl. id='admin')      |
| POST   | /api/fines                              | trainer+       | Tildel bøde manuelt                              |
| DELETE | /api/fines/:id                          | trainer+       | Slet bøde                                        |
| GET    | /api/fine-payments                      | player+        | Indbetalinger (?player_id= filter)               |
| POST   | /api/fine-payments                      | trainer+       | Registrér indbetaling                            |
| DELETE | /api/fine-payments/:id                  | trainer+       | Slet indbetaling                                 |
| GET    | /api/vapid-public-key                   | Alle           | VAPID public key (ingen auth)                    |
| POST   | /api/push-subscriptions                 | player+        | Gem push-subscription                            |
| DELETE | /api/push-subscriptions                 | player+        | Slet push-subscription                           |
| GET    | /api/records                            | player+        | Alle holdrekorder `{oldboys: [], senior: []}`    |
| PUT    | /api/records/:id                        | admin          | Rediger rekordværdi/kontekst/label               |
| GET    | /api/standings                          | player+        | Sæsonstillinger (?team_type=&season= filter)     |
| POST   | /api/standings                          | admin          | Opret sæsonstilling                              |
| PUT    | /api/standings/:id                      | admin          | Opdater sæsonstilling                            |
| GET    | /api/standings/matches                  | player+        | Kamphistorik (?team_type=&season=&opponent= filter) |
| POST   | /api/board/read                         | player+        | Opdater last_read_at                             |
| GET    | /api/board/posts                        | player+        | Hent opslag (?page=&limit=&archived=1)           |
| POST   | /api/board/posts                        | player+        | Opret opslag                                     |
| GET    | /api/board/posts/:id                    | player+        | Hent enkelt opslag                               |
| PUT    | /api/board/posts/:id                    | self           | Rediger eget opslag                              |
| DELETE | /api/board/posts/:id                    | self           | Slet eget opslag (soft delete)                   |
| POST   | /api/board/posts/:id/pin                | trainer+       | Toggle fastgørelse                               |
| POST   | /api/board/posts/:id/archive            | admin          | Toggle arkivering                                |
| GET    | /api/board/posts/:id/comments           | player+        | Hent kommentarer til opslag                      |
| POST   | /api/board/posts/:id/comments           | player+        | Opret kommentar                                  |
| PUT    | /api/board/posts/:id/comments/:cid      | self           | Rediger kommentar                                |
| DELETE | /api/board/posts/:id/comments/:cid      | self           | Slet kommentar (soft delete)                     |
| POST   | /api/board/posts/:id/attachments        | self           | Upload vedhæftning til R2 (filnavn via X-Filename header) |
| DELETE | /api/board/attachments/:aid             | self           | Slet vedhæftning fra R2 + DB                     |
| GET    | /api/honors                             | player+        | Alle hædersbevisninger (?player_id= filter)      |
| GET    | /api/honors/summary                     | player+        | Aggregeret per honor_type (til Hæder-siden)      |
| POST   | /api/honors                             | admin          | Tildel manuel hædersbevisning                    |
| DELETE | /api/honors/:id                         | admin          | Slet hædersbevisning (kun manuelle)              |

---

## Design & branding

### Klubnavn
- Lang format: **Copenhagen Forza Chang** (bruges i header på desktop, login-side, og officielle kontekster)
- Kort format: **CFC** (bruges i header på mobil, favicon, og kompakte UI-elementer)

### Logo
- Fil: `frontend/src/assets/logo.svg` (transparent SVG — bruges på mørk baggrund)
- Email-logo: `frontend/public/logo-email.jpg` (JPG — bruges i email-skabeloner)
- Brug aldrig logoet på hvid baggrund uden at teste kontrasten

### Farveskema (lyst tema)
```css
--cfc-bg-primary:    #f5f5f3;   /* Sidebaggrund */
--cfc-bg-card:       #ffffff;   /* Kort og paneler */
--cfc-bg-hover:      #f0f0ee;   /* Hover-states */
--cfc-border:        #e0e0e0;   /* Kanter */
--cfc-text-primary:  #1a1a1a;   /* Primær tekst */
--cfc-text-muted:    #666666;   /* Dæmpet tekst (labels, meta) */
--cfc-text-subtle:   #999999;   /* Meget dæmpet (placeholders) */
--green:             #1D9E75;   /* Accent (uændret) */
```

### Typebadges (events)
- Kamp: `#0f1a2e` bg / `#5b8dd9` tekst
- Event: `#1a1200` bg / `#c4a000` tekst

### Tilmeldingsbadges
- Tilmeldt: `#162416` bg / `#5a9e5a` tekst
- Afmeldt: `#2a1010` bg / `#e57373` tekst
- Ikke meldt ud: `var(--cfc-bg-hover)` / `var(--cfc-text-subtle)`

### Typografi
- Titler og holdnavne: `Georgia, serif`
- UI-tekst og navigation: system sans-serif
- Letter-spacing på uppercase labels: `0.08–0.12em`

### Responsive header
- **Desktop**: Logo + "Copenhagen Forza Chang" + horisontal navigation + brugerpille
- **Mobil (< 768px)**: Logo + "CFC" + hamburger-menu ELLER bundnavigation med ikoner
- Navigation kollapser på mobil — brug ikke horisontal scroll i nav

### Generelle UI-principper
- Mørkt tema throughout — ingen hvid baggrund på sider
- Kort har `border: 0.5px solid #2a2a2a` og `border-radius: 10px`
- Ingen skygger — dybde skabes med lagdelte baggrundsfarver

---

## Kalender-side (Matches.tsx → /kalender)

### Tilmelding
- **One-click**: Tilmeld/Afmeld-knapper aktiverer med det samme — kommentar kan tilføjes bagefter via `+ kommentar`
- **Annullering**: `↩ Annullér` fjerner tilmelding helt (DELETE signup)
- Trainer/admin ser per-spiller Tilmeld/Afmeld-knapper i event-detaljevisningen
- Administrer tilmeldinger viser alle aktive spillere ekskl. id='admin' — knapper har `padding: 6px 12px, fontSize: 13` for god mobil-touch-størrelse

### Opret/rediger event (modal)
- Sluttid auto-fyldes til starttid når start sættes
- Mødetid auto-fyldes til start − 40 min
- Tilmeldingsfrist auto-fyldes til start − 5 dage (matchende `signup_deadline_days`-default)
- Alle tider redigérbare bagefter

### Reminder-banner
- Vises kun hvis bruger har ubesvarede events med frist inden for de næste **14 dage**
- Tæller kun events med `my_status == null` og `signup_deadline` inden 14 dage

### Quickfiltre (over søgefeltet)
- **Alle** — ingen filtrering
- **Frist inden 14 dage** — events med deadline i de næste 14 dage
- **Manglende tilmelding** — aktive events hvor brugeren ikke har nogen tilmelding

### Urgent-markering
- Events med `my_status == null` og `start_time` inden for 8 dage vises med gul baggrund og fed gul titel
- Gælder kun aktive events i fremtiden

### Påmind-knap (trainer/admin)
- Vises i event-detaljemodal for aktive events
- Åbner panel med liste over spillere der ikke har meldt ud (checkboxes, alle pre-selected)
- Sender email-påmindelser direkte — ingen bekræftelsesdialog
- Viser "✓ Påmindelse sendt til X spillere" efter afsendelse

### Tilmeldte-sektion (kollapsbar)
- Overskriften "Tilmeldte (N)" er klikbar og folder listen ind/ud
- Valget huskes i `localStorage` (`cfc_tilmeldte_collapsed`) på tværs af events og sessioner

### Kommentarfrist på tilmelding
- "+ kommentar"-knappen på tilmeldingen ghostes (grå, ikke-klikbar) når der er færre end X timer til eventstart
- Kommentarsektionens inputfelt erstattes af grå kursiv-besked "Kommentarer lukket X timer før kampstart"
- X styres af `comment_cutoff_hours`-setting (default 24, sæt til 0 for aldrig at lukke)
- Setting hentes fra `GET /api/settings` ved sideload i `Matches`-komponenten og sendes som prop til `EventDetailModal` og `CommentSection`

---

## Vigtige noter

- JWT gemmes i `localStorage` på frontend
- `api.ts` bruger `import.meta.env.PROD` til at skelne prod/dev BASE_URL
- Scheduled Worker (cron, dagligt kl. 09:00 UTC) kører webcal-sync, email-påmindelser og holdrekord-opdatering
- Kalender-historik: events rykkes til historik-tab 24 timer efter `start_time`
- Navigation (desktop): **Kalender** → **Opslagstavle** → **Afstemning** → **Historie** → **Bødekasse** → **Admin**
- Navigation (mobil bundnav): **Kalender** · **Tavle** · **Afstemning** · **Mere** (slide-up panel med Historie, Bøder, Admin, Profil, Log ud)
- `/statistik` og `/hæder` redirecter til `/historie` (bagudkompatibilitet)
- `/hæder` redirecter til `/historie?tab=haeder`
- Admin-siden har to tabs: **Spillere** og **Indstillinger**
- Admin → Indstillinger har fire sektioner: **Webcal-sync**, **Tilmeldingsfrist** (signup_deadline_days + bulk-opdater), **Påmindelser** (reminder_days_before), **Kommentarfrist** (comment_cutoff_hours)
- Admin → Spillere har tre sub-tabs: **Aktive**, **Pensionerede** og **Licensliste** (alle spillere sorteret stigende efter DAI-licensnummer)
- Spillere med `active=0` omtales som **pensionerede** (ikke "passive" eller "tidligere") — i Admin-faner, Stats-filtre og lister
- Admin login: `admin` / `admin123` — **skift dette med det samme i prod!**
- D1 returnerer integers (0/1) ikke booleans — brug altid `=== 1` (ikke `&&`) til conditional rendering i React for integer-kolonner som `pinned`, `archived`, `deleted`

---

## Fase 7 — Kommentarer

### Kommentarer (`event_comments` tabel)

| Felt        | Type    | Beskrivelse                                                    |
|-------------|---------|----------------------------------------------------------------|
| `id`        | TEXT    | UUID                                                           |
| `event_id`  | TEXT    | FK → events.id                                                 |
| `player_id` | TEXT    | FK → players.id                                                |
| `body`      | TEXT    | Kommentartekst inkl. @-mentions (fx "@Casper" eller "@alle")   |
| `edited_at` | TEXT    | Tidsstempel for seneste redigering (NULL hvis uændret)         |
| `deleted`   | INTEGER | 1 = slettet, vises som grå placeholder i UI                   |
| `created_at`| TEXT    | Oprettelsestidspunkt                                           |

### Ulæst-tracking (`comment_reads` tabel)

| Felt           | Type | Beskrivelse                                        |
|----------------|------|----------------------------------------------------|
| `player_id`    | TEXT | FK → players.id                                    |
| `event_id`     | TEXT | FK → events.id                                     |
| `last_read_at` | TEXT | Tidsstempel for seneste åbning af kommentarsektion |

PRIMARY KEY på `(player_id, event_id)`. Ulæste beregnes dynamisk: kommentarer med `created_at > last_read_at` og `deleted = 0`.

### Regler
- Alle spillere kan skrive kommentarer på alle events og kampe
- Spillere kan **redigere** egne kommentarer — `edited_at` opdateres
- Spillere kan **slette** egne kommentarer — soft delete (`deleted=1`), vises som "[Denne kommentar er slettet]"
- Trainer/admin kan **ikke** slette andres kommentarer
- `last_read_at` opdateres når spilleren åbner kommentarsektionen

### @-mentions
- `@Navn` matcher mod aktive spilleres alias/fornavn (case-insensitive autocomplete)
- `@alle` er en særlig tag — vises øverst i dropdown
- @-mentions highlightes med blå baggrund (`#1a2a4a` / `#5b8dd9`) i kommentarteksten
- Autocomplete-dropdown vises når man skriver `@` — kun visuelt, ingen email-notifikationer

### Ulæst-badge i event-listeview
- Blåt badge (`💬 N`) vises på event-kortet hvis der er ulæste kommentarer
- Farve: `#1a3a5c` bg / `#5b8dd9` tekst
- Nulstilles når spilleren åbner kommentarsektionen

### Frontend — kommentarsektion (i event-detaljemodal)
- Foldbar sektion "💬 Kommentarer (N)" under tilmeldingslisten
- Åbner/lukker med toggle — markerer kommentarer som læst ved åbning
- Sorteringstoggle: "↑ Ældste først" (default) / "↓ Nyeste først"
- Textarea med `@`-autocomplete og Enter-to-send (Shift+Enter = linjeskift)
- Slettede kommentarer vises som grå kursiv-placeholder uden avatar/navn
- Redigerede kommentarer viser "· redigeret" i grå

### API-routes

| Method | Path                              | Rolle    | Beskrivelse                                      |
|--------|-----------------------------------|----------|--------------------------------------------------|
| GET    | /api/events/:id/comments          | player+  | Hent alle kommentarer for event (inkl. deleted)  |
| POST   | /api/events/:id/comments          | player+  | Opret kommentar                                  |
| PUT    | /api/events/:id/comments/:cid     | self     | Rediger egen kommentar                           |
| DELETE | /api/events/:id/comments/:cid     | self     | Slet egen kommentar (soft delete, deleted=1)     |
| POST   | /api/events/:id/comments/read     | player+  | Markér kommentarer som læst (UPSERT last_read_at)|

`GET /api/events` returnerer `unread_comments` count per event. `GET /api/events/:id` returnerer `comment_count`.

---

## Fase 8 — Hædersbevisninger

### Hædersbevisningskatalog (`honor_types` tabel)

| Felt              | Type    | Beskrivelse                                              |
|-------------------|---------|----------------------------------------------------------|
| `id`              | TEXT    | UUID                                                     |
| `key`             | TEXT    | Unik nøgle, fx `kampe_100` (UNIQUE)                      |
| `name`            | TEXT    | Visningsnavn, fx "100 kampe"                             |
| `type`            | TEXT    | `auto` eller `manual`                                    |
| `threshold_type`  | TEXT    | `matches`, `seasons`, `mom`, `goals` eller NULL          |
| `threshold_value` | INTEGER | Grænseværdi, fx 100 — eller NULL for manuelle            |
| `sort_order`      | INTEGER | Rækkefølge i UI                                          |

Seed-data (15 typer): 12 automatiske milestones (kampe 100/200, sæsoner 5/10/15/20, MoM 10/20/50, mål 50/100/150) + 3 manuelle priser (Årets spiller, Årets fighter, Årets kammerat).

### Tildelte hædersbevisninger (`player_honors` tabel)

| Felt            | Type    | Beskrivelse                                              |
|-----------------|---------|----------------------------------------------------------|
| `id`            | TEXT    | UUID                                                     |
| `player_id`     | TEXT    | FK → players.id                                          |
| `honor_type_id` | TEXT    | FK → honor_types.id                                      |
| `season`        | INTEGER | Årstal (påkrævet for manuelle, NULL for automatiske)     |
| `awarded_by`    | TEXT    | FK → players.id (NULL for auto-tildelte)                 |
| `created_at`    | TEXT    | Tidsstempel                                              |

UNIQUE constraint på `(player_id, honor_type_id, season)`.
- Automatiske: `season = NULL` — én spiller kan kun have én "100 kampe"-hædersbevisning
- Manuelle: `season` er årstallet — en spiller kan vinde "Årets spiller" flere gange

### Automatisk tildeling
- Tjekkes server-side ved `POST /api/stats` (gem kampstatistik) og ved webcal-sync (dagligt)
- Beregner totaler fra `match_stats` + `player_stats_legacy` kombineret
- Indsættes med `INSERT OR IGNORE` for idempotens
- Implementeret i `worker/src/routes/honors.ts` → `autoAssignHonors(env, playerIds)`

### Import af historiske hædersbevisninger
Script: `scripts/scrape_honors.py` — parser `title`-attributter på pokalbilderne fra forzachang.dk

```bash
python3 scripts/scrape_honors.py
# Generer database/seed_honors.sql

wrangler d1 execute forzachang-db --remote --file=database/seed_honors.sql
```

- Automatiske pokaler importeres uden årstal (season = NULL)
- Manuelle pokaler forsøges importeret med årstal fra title-attribut
- Linjer markeret med `MANGLER_ÅRSTAL` i SQL-filen skal udfyldes manuelt
- Kræver: `pip install requests beautifulsoup4`

### Frontend
- **Hæder-siden** (`/hæder`, `Haeder.tsx`): selvstændig overordnet fane med to underfaner:
  - **Præstationer**: automatiske milestones (alle modtagere alfabetisk, badges)
  - **Kåringer**: manuelle årspriser (årstal → spiller, faldende) — Årets spiller vises før Årets fighter
- **Spillerprofil-modal**: kollapsbar sektion "🏅 Hædersbevisninger (N)" over statistiktabellen — kollapset som default; milestones som blå badges, manuelle priser som `Årets spiller 2013, 2021`
- **Admin → Spillere → fold ud**: sektion "Hædersbevisninger" med liste over tildelte + "+ Tildel hædersbevisning"-knap → dropdown (kun manuelle typer) + årstal-input

### Auto-tildeling — duplikat-håndtering
SQLite UNIQUE constraint ignorerer `NULL = NULL`, så `season=NULL` rækker kan duplikeres. `autoAssignHonors()` bruger derfor `INSERT ... WHERE NOT EXISTS` i stedet for `INSERT OR IGNORE` for automatiske hædersbevisninger.

---

## Fase 9 — PWA og Push-notifikationer

### PWA-opsætning
- `frontend/public/manifest.json`: navn "Copenhagen Forza Chang", kort navn "CFC", `display: standalone`, sort baggrund
- `frontend/public/sw.js`: service worker — push-events, notifikationsklik, offline-cache af navigationsrequests
- `frontend/public/icon-192.png` + `icon-512.png`: genereret fra `logo-email` med sips
- Service worker registreres i `main.tsx` ved `window load`-event

### Installationsbanner (`PwaBanner.tsx`)
- Vises 3 sekunder efter login — kun første gang (`localStorage` nøgle `pwa_prompt_dismissed`)
- Vises ikke hvis appen allerede kører i standalone-mode
- Klik → modal med platformsspecifikke instruktioner:
  - **iOS (Safari)**: Del-ikon → "Føj til hjemmeskærm"
  - **Android (Chrome)**: `beforeinstallprompt`-event → native prompt, eller menu-instruktioner
  - **Andet**: "Brug Chrome eller Safari på din telefon"
- "Luk og vis ikke igen"-knap afviser permanent

### Push-notifikationer — Web Push Protocol
Implementeret manuelt med `crypto.subtle` (Cloudflare Workers understøtter ikke Node.js `crypto`):
- **`worker/src/lib/webpush.ts`**: RFC 8030 + RFC 8291 (aes128gcm-kryptering) + RFC 8292 (VAPID JWT)
  - ECDH nøgleudveksling, HKDF-SHA256 key derivation, AES-128-GCM kryptering
  - VAPID JWT signeret med ECDSA P-256
- **`worker/src/lib/sendPush.ts`**: fan-out til alle enheder for én spiller, rydder op i udløbne subscriptions (410/404)
- **VAPID secrets** (Worker secrets): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

### Notifikationstyper

| Hændelse | Title | Body | URL |
|----------|-------|------|-----|
| Auto-påmindelse (cron) | "⚽ Husk tilmelding" | "Du mangler at melde dig til [event]" | `/kalender?filter=manglende` |
| Manuel påmindelse | "⚽ Husk tilmelding" | "Du mangler at melde dig til [event]" | `/kalender?filter=manglende` |
| @-mention i kommentar | "💬 [Navn] nævnte dig" | "...i kommentarer til [event]" | `/kalender` |
| @alle i kommentar | "💬 [Navn] nævnte alle" | "...i kommentarer til [event]" | `/kalender` |

### Notifikationsindstillinger (Min profil)
- Ny sektion "Notifikationer" i `Profile.tsx`
- Toggle for email-påmindelser (`notify_email`) og push-notifikationer (`notify_push`)
- Gem-knap kalder `PUT /api/players/:id` + håndterer `Notification.requestPermission()` + subscribe/unsubscribe

### VAPID-nøgler (generering)
```bash
node -e "
const { webcrypto } = require('crypto');
(async () => {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const privJwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey);
  const b64url = buf => Buffer.from(buf).toString('base64url');
  console.log('PUBLIC_KEY=' + b64url(pub));
  console.log('PRIVATE_KEY=' + privJwk.d);
})();"

wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT   # fx "mailto:admin@forzachang.eu"
```

---

## Fase 10 — Historie (Spillerhistorik + Holdhistorik)

### Oversigt
`Historie.tsx` samler al historik i én side (`/historie`) med to hoved-tabs:

| Tab | URL | Indhold |
|-----|-----|---------|
| Spillerhistorik (default) | `/historie` | Sub-tabs: Sæsonoversigt / Spillerstatistik / Top 10 / Hæder |
| Holdhistorik | `/historie?tab=hold` | Sub-tabs: Tidligere sæsoner (default) / Holdrekorder |

`Stats.tsx` og `Haeder.tsx` er bibeholdt som filer men bruges nu kun internt af `Historie.tsx`.

Bagudkompatibilitet:
- `/statistik` → `/historie`
- `/hæder` → `/historie?tab=haeder`

### Spillerhistorik — underfaner

| Fane | Default sæsonfilter | Beskrivelse |
|------|---------------------|-------------|
| Sæsonoversigt | Indeværende år | Tabel over alle spillere med kampe, mål, MoM, kort, bøder — klik → spillerprofil-modal |
| Spillerstatistik | Alle sæsoner | Samme data som kort-liste — klik → spillerprofil-modal |
| Top 10 | Alle sæsoner | 6 søjlediagrammer: kampe, mål, MoM, gule kort, røde kort, bøder |
| Hæder | — (ingen sæsonfilter) | Præstationer (automatiske milestones med modtagere som badges) + Kåringer (Årets spiller/fighter/kammerat som årstal-tabeller) |

Hvert sub-tab husker sit eget sæsonvalg inden for sessionen. Hæder-fanen har ingen sæson/spillerfiltre og loader sine egne data uafhængigt.

### Holdrekorder (`team_records` tabel)

| Felt         | Type    | Beskrivelse                                              |
|--------------|---------|----------------------------------------------------------|
| `id`         | TEXT    | UUID                                                     |
| `team_type`  | TEXT    | `oldboys` eller `senior`                                 |
| `record_key` | TEXT    | Unik nøgle per team_type, fx `biggest_win`               |
| `label`      | TEXT    | Visningsnavn, fx "Største sejr"                          |
| `value`      | TEXT    | Rekordværdi, fx "14-0"                                   |
| `context`    | TEXT    | Kontekst, fx "mod Lokomotiv KBH, 1/10-2019"             |
| `auto_update`| INTEGER | 1 = opdateres automatisk, 0 = manuelt vedligeholdt       |
| `sort_order` | INTEGER | Rækkefølge i UI                                          |
| `updated_at` | TEXT    | Tidsstempel                                              |

UNIQUE på `(team_type, record_key)`. Seed-data i `database/seed_records.sql` (10 oldboys + 10 senior rekorder, alle `auto_update=0`).

### Sæsonstillinger (`season_standings` tabel)

| Felt               | Type    | Beskrivelse                                  |
|--------------------|---------|----------------------------------------------|
| `id`               | TEXT    | UUID                                         |
| `team_type`        | TEXT    | `oldboys` eller `senior`                     |
| `season`           | INTEGER | Årstal                                       |
| `position`         | INTEGER | Placering i rækken                           |
| `league`           | TEXT    | Rækkenavn                                    |
| `played/won/...`   | INTEGER | Kampstatistik                                |
| `goals_for/against`| INTEGER | Målscore                                     |
| `points`           | INTEGER | Point                                        |

UNIQUE på `(team_type, season)`.

### Kamphistorik (`season_matches` tabel)

| Felt           | Type    | Beskrivelse                              |
|----------------|---------|------------------------------------------|
| `id`           | TEXT    | UUID                                     |
| `team_type`    | TEXT    | `oldboys` eller `senior`                 |
| `season`       | INTEGER | Årstal                                   |
| `match_date`   | TEXT    | Kampdate (ISO 8601)                      |
| `opponent`     | TEXT    | Modstander                               |
| `home_away`    | TEXT    | `hjemme` eller `ude`                     |
| `goals_for`    | INTEGER | Mål for (altid fra CFCs perspektiv)      |
| `goals_against`| INTEGER | Mål imod (altid fra CFCs perspektiv)     |
| `result`       | TEXT    | `sejr`, `uafgjort` eller `nederlag`      |
| `event_id`     | TEXT    | FK → events.id (NULL for historiske)     |

UNIQUE på `(team_type, season, match_date, opponent)`.

### Holdhistorik — visning i frontend
- Sæsoner hentes fra `season_standings` (slutstillinger) + `season_matches` (kampdata)
- **Igangværende sæson**: sæsoner der har kampe i `season_matches` men ingen slutstilling i `season_standings` vises øverst med label "Igangværende sæson" og er åbne som default (`MatchOnlySeasonSection`-komponent)
- **Afsluttede sæsoner**: vises som foldbare kort med slutstilling + kampprogram (`SeasonSection`-komponent)
- Når sæsonen slutter: opret en række i `season_standings` manuelt — kortet skifter automatisk til normal visning

---

## Fase 11 — Opslagstavle

### Opslag (`board_posts` tabel)

| Felt         | Type    | Beskrivelse                                |
|--------------|---------|--------------------------------------------|
| `id`         | TEXT    | UUID                                       |
| `player_id`  | TEXT    | FK → players.id                            |
| `title`      | TEXT    | Valgfri titel                              |
| `body`       | TEXT    | Oplagstekst (inkl. @-mentions)             |
| `pinned`     | INTEGER | 1 = fastgjort                              |
| `pinned_by`  | TEXT    | FK → players.id (NULL hvis ikke fastgjort) |
| `archived`   | INTEGER | 1 = arkiveret (skjult fra normal liste)    |
| `edited_at`  | TEXT    | Tidsstempel for redigering (NULL = aldrig) |
| `deleted`    | INTEGER | 1 = soft-slettet                           |
| `deleted_at` | TEXT    | Tidsstempel for sletning                   |
| `created_at` | TEXT    | Oprettelsestidspunkt                       |

### Vedhæftninger (`board_attachments` tabel)

| Felt         | Type    | Beskrivelse                                          |
|--------------|---------|------------------------------------------------------|
| `id`         | TEXT    | UUID                                                 |
| `post_id`    | TEXT    | FK → board_posts.id                                  |
| `type`       | TEXT    | `image` eller `document`                             |
| `filename`   | TEXT    | Originalt filnavn (bevaret fra klientens fil)        |
| `r2_key`     | TEXT    | R2-nøgle (format: `board/{postId}/{uuid}.ext`)       |
| `url`        | TEXT    | Public R2 URL                                        |
| `size_bytes` | INTEGER | Filstørrelse i bytes                                 |
| `created_at` | TEXT    | Oprettelsestidspunkt                                 |

Maks filstørrelse: billeder 10 MB, dokumenter 20 MB.
Accepts: `image/*`, `application/pdf`, Word (`.doc`/`.docx`), Excel (`.xls`/`.xlsx`), PowerPoint (`.ppt`/`.pptx`).
Lagres i samme R2-bucket som avatarer (`forzachang-avatars`) under `board/`-præfiks.
Filnavn sendes fra frontend som `X-Filename`-header (URL-encoded) og bevares i databasen.

### Kommentarer (`board_comments` tabel)

| Felt         | Type    | Beskrivelse                                     |
|--------------|---------|-------------------------------------------------|
| `id`         | TEXT    | UUID                                            |
| `post_id`    | TEXT    | FK → board_posts.id                             |
| `player_id`  | TEXT    | FK → players.id                                 |
| `body`       | TEXT    | Kommentartekst                                  |
| `edited_at`  | TEXT    | Tidsstempel for redigering                      |
| `deleted`    | INTEGER | 1 = soft-slettet                                |
| `deleted_at` | TEXT    | Tidsstempel for sletning                        |
| `created_at` | TEXT    | Oprettelsestidspunkt                            |

### Læst-tracking (`board_reads` tabel)

| Felt           | Type | Beskrivelse                              |
|----------------|------|------------------------------------------|
| `player_id`    | TEXT | PRIMARY KEY — FK → players.id            |
| `last_read_at` | TEXT | Tidsstempel for seneste besøg på tavlen  |

### Regler
- Alle spillere kan oprette opslag og kommentarer
- Spillere kan kun redigere/slette egne opslag og kommentarer (soft delete)
- Trainer/admin kan fastgøre (pin) opslag — fastgjorte vises øverst
- Admin kan arkivere opslag — arkiverede skjules fra normal liste
- `@Navn` og `@alle` udløser push-notifikationer (samme mønster som event-kommentarer)
- Ulæst-badge i navigation: blå prik (`#5b8dd9`) hvis nye opslag siden sidst besøg

### Frontend — Board.tsx
- Opslag-liste: fastgjorte øverst, derefter faldende created_at
- Quickfilter for admin: **Aktive** / **Arkiverede** (`?archived=1`)
- Arkivér-knap i oplagsfooter — kun synlig for admin, viser "↩ De-arkivér" for arkiverede
- "Nyt opslag"-modal med `@`-autocomplete og filvedhæftning
  - Billeder vises inline, dokumenter som downloadlink med originalt filnavn
- Oplagskort med avatar, navn, tidsstempel, titel (hvis sat), tekst (highlights @-mentions), vedhæftningslinje
- Pin/unpin-knap (📌) for trainer/admin
- Foldbar kommentarsektion per opslag med inline editor og @-autocomplete
- `localStorage` nøgle `cfc_board_last_read` til unread-tracking
- `pinned === 1` (ikke `pinned &&`) bruges til conditional rendering (D1 returnerer integers)
- Vedhæftninger hentes via `JSON_GROUP_ARRAY(JSON_OBJECT(...))` i alle GET-queries og udpakkes med `parseAttachments()`-helper

### Notifikationstyper (opslagstavle)

| Hændelse | Title | Body | URL |
|----------|-------|------|-----|
| @-mention i opslag | "📌 [Navn] nævnte dig" | "...i et opslag på opslagstavlen" | `/opslagstavle` |
| @alle i opslag | "📌 [Navn] nævnte alle" | "...i et opslag på opslagstavlen" | `/opslagstavle` |
| @-mention i kommentar | "📌 [Navn] nævnte dig" | "...i en kommentar på opslagstavlen" | `/opslagstavle` |
| @alle i kommentar | "📌 [Navn] nævnte alle" | "...i en kommentar på opslagstavlen" | `/opslagstavle` |

---

## Fase 12 — Kampens Spiller afstemning

### Tabeller

#### `vote_sessions`
| Felt         | Type | Beskrivelse                                                    |
|--------------|------|----------------------------------------------------------------|
| `id`         | TEXT | UUID                                                           |
| `event_id`   | TEXT | FK → events.id (NULL = ad-hoc afstemning uden tilknyttet kamp) |
| `title`      | TEXT | Valgfri titel — vises i stedet for kampnavn ved ad-hoc         |
| `started_by` | TEXT | FK → players.id (trainer/admin der startede)                   |
| `started_at` | TEXT | Starttidspunkt                                                 |
| `ends_at`    | TEXT | Sluttidspunkt (auto-lukkes når overskredet)                    |
| `status`     | TEXT | `active` eller `closed`                                        |
| `candidates` | TEXT | JSON-array af player IDs (hvem kan stemmes på)                 |
| `voters`     | TEXT | JSON-array af player IDs (hvem kan stemme)                     |
| `created_at` | TEXT | Oprettelsestidspunkt                                           |

#### `votes`
| Felt           | Type | Beskrivelse                                      |
|----------------|------|--------------------------------------------------|
| `id`           | TEXT | UUID                                             |
| `session_id`   | TEXT | FK → vote_sessions.id                            |
| `voter_id`     | TEXT | FK → players.id (den der stemmer)                |
| `candidate_id` | TEXT | FK → players.id (den der stemmes på)             |
| `created_at`   | TEXT | Tidsstempel (opdateres ved omstemmning)          |

UNIQUE på `(session_id, voter_id)` — én stemme per spiller per session.

### Regler
- Kun trainer/admin kan starte, slette og administrere afstemninger
- Ingen begrænsning på antal sessioner per kamp — flere kan oprettes
- `event_id` er nullable: NULL = ad-hoc afstemning (ikke tilknyttet en kamp)
- Candidates og voters opsættes manuelt i setup-fasen (pre-udfyldt fra tilmeldingslisten)
- Varighed er konfigurerbar (15–180 sek, default 60) — vises som nedtælling med SVG-cirkel
- Session auto-lukkes af worker når `ends_at` overskrides (tjekkes ved hvert GET)
- Én stemme per spiller — upsert, kan ændres mens afstemningen er åben
- Trainer/admin kan slette en session (DELETE) — sletter også alle stemmer
- Push-notifikation sendes til alle voters ved sessionstart

### API-routes

| Method | Path                                    | Rolle     | Beskrivelse                                                 |
|--------|-----------------------------------------|-----------|-------------------------------------------------------------|
| GET    | /api/votes                              | player+   | Hent seneste session (active eller closed)                  |
| POST   | /api/votes/sessions                     | trainer+  | Opret ny afstemning (body: event_id?, title?, candidate_ids, voter_ids, duration_seconds) |
| DELETE | /api/votes/sessions/:id                 | trainer+  | Slet afstemning + alle stemmer                              |
| POST   | /api/votes/sessions/:id/vote            | player+   | Afgiv/opdater stemme (body: candidate_id)                   |
| GET    | /api/votes/sessions/:id/results         | player+   | Hent resultater (rangeret)                                  |

### Frontend — Afstemning.tsx (`/afstemning`)
Fire tilstande:
1. **Idle**: Trainer/admin ser liste over kampe fra i dag og de seneste 7 dage + "✨ Start ad-hoc afstemning"-knap. Spillere (ikke trainer/admin) ser kun "Ingen igangværende afstemning".
2. **Setup** (trainer/admin): Konfigurer kandidater, vælgere og varighed (slider 15–180 sek) — pre-udfyldt fra tilmeldingslisten ved kampvalg, tom ved ad-hoc
3. **Voting**: SVG-nedtællingscirkel + kandidatliste — klik på spiller for at stemme
4. **Results**: Rangeret liste med stemmebar og 🏆 til vinder; trainer/admin ser "🗑 Slet afstemning"-knap

#### Rollebaseret adgang
- **Trainer/admin**: fuld adgang — idle-skærm med kampliste, setup, voting, results
- **Spiller**: ser kun aktiv afstemning (voting), resultat af seneste afstemning (results), eller "Ingen igangværende afstemning" — aldrig idle-skærm med kampliste

- Polling hvert 2. sekund under voting-fasen (via `useRef<setInterval>`)
- Kampfilter: `start_time >= nu − 7 dage` og `<= slutningen af i dag` (henter fra begge tabs: historik + kommende)
- Ad-hoc: `event_id = null`, valgfri titel — "Ad-hoc afstemning" hvis ingen titel

Navigation: 🏆 **Afstemning** — fast ikon i bundnav (mobil) og desktop-nav.

### Mobiloptimering (lyst tema)
- CSS-variabler ændret til lyst tema: `--cfc-bg-primary: #f5f5f3`, `--cfc-bg-card: #ffffff`
- Accent: `--green: #1D9E75` (uændret)
- `input/select/textarea`: `font-size: 16px` (iOS auto-zoom undgås)
- `.btn`: `min-height: 44px`, `.input`: `min-height: 44px` (touch targets)
- Bundnav: 3 faste ikoner (Kalender, Tavle, Afstemning) + Mere-knap (☰)
- Mere-panel: slide-up med rundet top, linker til Historie, Bøder, Admin (trainer/admin), Profil, Log ud
- `paddingBottom: env(safe-area-inset-bottom)` på bundnav (iPhone safe area)
- Opslagstavle-kort: hvid baggrund, `border-radius: 12px`, subtil `box-shadow`
