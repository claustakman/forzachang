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
│   └── schema.sql              # D1 database schema + seed data
├── worker/                     # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts            # Router + scheduled jobs (webcal-sync + reminders)
│   │   ├── lib/auth.ts         # JWT + password helpers
│   │   └── routes/
│   │       ├── auth.ts
│   │       ├── players.ts      # Inkl. POST /:id/avatar → R2
│   │       ├── events.ts       # Events + tilmeldinger + gæster + påmindelser
│   │       ├── settings.ts     # App-indstillinger (webcal URL m.m.)
│   │       ├── matches.ts      # Gamle kampe (legacy)
│   │       ├── signups.ts      # Gamle tilmeldinger (legacy)
│   │       ├── stats.ts
│   │       └── fines.ts
│   └── wrangler.toml
├── frontend/                   # React app
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts          # API client (BASE_URL skifter prod/dev)
│   │   │   └── auth.tsx        # Auth context (JWT i localStorage)
│   │   ├── components/
│   │   │   └── Layout.tsx      # Navigation shell
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Matches.tsx     # Kalender: events + tilmeldinger (rutet som /kalender)
│   │       ├── Stats.tsx       # Statistik (19 sæsoner)
│   │       ├── Fines.tsx       # Bødekasse
│   │       ├── Admin.tsx       # Spillere + indstillinger (tabs: players, settings)
│   │       └── Profile.tsx     # Profil inkl. avatar-upload
│   └── vite.config.ts
├── scripts/
│   └── scrape_stats.py         # Scraper historisk statistik fra forzachang.dk → seed SQL
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
| `alias`          | TEXT    | Kaldenavn — vises i stedet for fornavn i frontend  |
| `birth_date`     | TEXT    | Fødselsdato (ISO 8601)                             |
| `email`          | TEXT    | Email                                              |
| `phone`          | TEXT    | Telefonnummer                                      |
| `shirt_number`   | INTEGER | Trøjenummer                                        |
| `license_number` | TEXT    | DBU licensnummer                                   |
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

Bødekatalog (13 typer — administreres via Admin → Bødekatalog):

| Navn | Beløb | auto_assign |
|------|-------|-------------|
| Direkte rødt kort | 240 kr | — |
| Udeblivelse fra kamp | 240 kr | — |
| To gule kort i samme kamp | 180 kr | — |
| Manglende udmelding til kamp | 160 kr | `no_signup` |
| Gult kort for brok eller opførsel | 120 kr | — |
| Afbud på kampdag | 120 kr | — |
| Fremmøde efter kampstart | 120 kr | — |
| For sen udmelding (efter frist) | 80 kr | `late_signup` |
| Gult kort | 60 kr | — |
| For sent fremmøde | 60 kr | — |
| Disciplinærstraf | 60 kr | — |
| Elendig aktion (min. 4 stemmer) | 60 kr | — |
| Afbud til kamp (Kennethgebyr) | 30 kr | `absence` |

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

### Profilbilleder (R2)
- Upload via `POST /api/players/:id/avatar` med raw image body
- Gemmes i R2-bucket `forzachang-avatars` under nøglen `avatars/{id}.{ext}`
- Public URL: `https://pub-afc843d1587d4ae3a4aa8f3d76547493.r2.dev/avatars/{id}.{ext}`
- Maks. 5 MB, kun JPG/PNG/WebP

### Alias
- Spillere kan sætte alias på egen profil (Min profil → Oplysninger)
- Admin kan sætte alias i Admin → Spillere → Rediger
- `displayName(p)` helper i `api.ts` returnerer `alias ?? fornavn`
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
- Nye events fra webcal får automatisk: `meeting_time = start − 40 min`, `signup_deadline = start − 7 dage`
- Alle webcal-events sættes altid til type `kamp`
- Manuel trigger: "Synkroniser nu"-knap under Admin → Indstillinger (kalder `POST /api/settings/sync`)

### Kampstatistik & Bøder (fase 5+6)
- Trainer/admin åbner "📊 Statistik & Bøder" via event-detaljemodal (kun afsluttede kampe)
- Knappen har sin egen fuldbred-række over Rediger/Luk/Påmind
- **Statistik-sektion**: tilmeldte spillere med inputfelter: mål, gule, røde, MoM (radio — kun én per kamp), spillet (checkbox)
- **Auto-udfyld statistik**: played=1 for tilmeldte, late_signup=1 for sent tilmeldte, absence=1 for afmeldte, no_signup=1 for spillere uden nogen reaktion
- **Tre lister** (read-only): Afbud (afmeldte) + Ikke meldt ud (gul overskrift, alle aktive spillere uden signup)
- **Bøde-sektion** under statistikken: foldbare sektioner per bødetype med checkboxes per spiller
  - Auto-bødetyper (`absence`, `late_signup`, `no_signup`) folder automatisk ud og pre-selecterer relevante spillere
  - Manuelle bødetyper starter lukkede
- **Gem**: statistik → `POST /api/stats` (auto-bøder tildeles server-side), manuelle bøder → `POST /api/fines` per tjekket spiller
- UNIQUE constraint på `(player_id, fine_type_id, event_id)` forhindrer duplikate bøder
- Slet kamp: lukker begge modaler og sender brugeren tilbage til kalenderlisten
- **Statistiksiden** (`/statistik`) kombinerer `match_stats` og `player_stats_legacy`:
  - Moderne data (`match_stats`) vinder over legacy for samme sæson/spiller
  - Tre visninger: **Top 10** (6 søjlediagrammer inkl. røde kort og bøder), **Sæsonoversigt** (tabel inkl. bøder), **Spillerprofil** (klik → modal med sæson-for-sæson inkl. bøder)
  - Filtre: sæson, aktiv/pensionerede/alle, fritekst-søgning
  - Spillerprofil-header viser avatar + alias (hvis sat) eller fuldt navn

### Bødekasse (fase 6)
- **Saldi beregnes dynamisk**: skyldig = SUM(fines.amount) − SUM(fine_payments.amount)
- **Automatisk tildeling** sker server-side ved gem af kampstatistik via `auto_assign`-feltet på bødetypen:
  - `absence` → tildeles spillere med `absence=1` (afmeldte)
  - `late_signup` → tildeles spillere med `late_signup=1` (tilmeldt efter frist)
  - `no_signup` → tildeles spillere der slet ikke har reageret (hverken tilmeldt eller afmeldt)
- **Manuelle bøder** tildeles af trainer/admin — enten fra Statistik & Bøder-modalen eller direkte fra Bødekassen
- **Bødeside** (`/bøder`): holdoversigt (total skyldig + total bøder), spillertabel (klik → detaljemodal), detaljemodal med bøder/indbetalinger-tabs
- **Admin → Bødekatalog**: liste over bødetyper, opret/rediger/arkivér, auto_assign-typer markeret med badge
- Alle kan se alles bøder og saldi

### Import af historisk statistik
- Script: `scripts/scrape_stats.py` — scraper forzachang.dk og genererer INSERT-SQL til `player_stats_legacy`
- Kør: `python3 scripts/scrape_stats.py > database/seed_stats.sql`
- Erstat `OLD_ID_X` placeholders med rigtige UUIDs fra `players`-tabellen
- Kør mod prod: `wrangler d1 execute forzachang-db --remote --file=database/seed_stats.sql`
- Kræver: `pip install requests beautifulsoup4`

### Påmindelser (fase 4)
- **Automatiske** (cron, dagligt kl. 09:00 UTC):
  - Med tilmeldingsfrist: sender påmindelse 3 dage før fristen
  - Uden tilmeldingsfrist: sender påmindelse 8 dage før start
  - Kun aktive spillere med email der ikke har tilmeldt/afmeldt sig
  - Sendes kun én gang per spiller per event (sporres i `reminder_log` med `type='auto'`)
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

| Method | Path                          | Rolle          | Beskrivelse                          |
|--------|-------------------------------|----------------|--------------------------------------|
| POST   | /api/auth/login               | Alle           | Login, returnerer JWT                |
| GET    | /api/players                  | admin          | Liste over spillere                  |
| POST   | /api/players                  | admin          | Opret spiller                        |
| PUT    | /api/players/:id              | self/admin     | Opdater spiller                      |
| POST   | /api/players/:id/avatar       | self/admin     | Upload profilbillede til R2          |
| GET    | /api/players/:id/logins       | admin          | Seneste 50 logins for spiller        |
| GET    | /api/events                   | player+        | Liste over events (med filtre)       |
| GET    | /api/events/:id               | player+        | Detaljer inkl. tilmeldinger          |
| POST   | /api/events                   | trainer+       | Opret event                          |
| PUT    | /api/events/:id               | trainer+/arrangør | Rediger event                     |
| DELETE | /api/events/:id               | trainer+       | Slet event                           |
| POST   | /api/events/:id/signup        | player+        | Tilmeld/afmeld fra event (body: status, message?, player_id?) |
| DELETE | /api/events/:id/signup        | player+        | Annullér tilmelding (?player_id= for trainer-proxy) |
| POST   | /api/events/:id/guests        | trainer+       | Tilføj gæst til event                |
| DELETE | /api/events/:id/guests/:gid   | trainer+       | Fjern gæst fra event                 |
| POST   | /api/events/:id/remind        | trainer+       | Send manuelle påmindelser (body: player_ids[]) |
| GET    | /api/events/:id/stats         | trainer+       | Hent kampstatistik + tilmeldte spillere        |
| POST   | /api/stats                    | trainer+       | Gem kampstatistik (body: event_id, rows[])     |
| GET    | /api/settings                 | admin          | Hent app-indstillinger               |
| PUT    | /api/settings                 | admin          | Gem app-indstillinger                |
| POST   | /api/settings/sync            | admin          | Manuel webcal-sync                   |
| GET    | /api/matches                  | player+        | Legacy: liste over kampe             |
| POST   | /api/matches                  | admin          | Legacy: opret kamp                   |
| POST   | /api/signups                  | player+        | Legacy: tilmeld/afmeld kamp          |
| GET    | /api/stats                    | player+        | Hent samlet statistik (legacy + match_stats kombineret) |
| GET    | /api/fine-types               | player+        | Liste over bødetyper                 |
| POST   | /api/fine-types               | admin          | Opret bødetype                       |
| PUT    | /api/fine-types/:id           | admin          | Rediger bødetype                     |
| DELETE | /api/fine-types/:id           | admin          | Arkivér bødetype (active=0)          |
| GET    | /api/fines                    | player+        | Alle bøder (?player_id= filter)      |
| GET    | /api/fines/summary            | player+        | Per-spiller aggregering              |
| POST   | /api/fines                    | trainer+       | Tildel bøde manuelt                  |
| DELETE | /api/fines/:id                | trainer+       | Slet bøde                            |
| GET    | /api/fine-payments            | player+        | Indbetalinger (?player_id= filter)   |
| POST   | /api/fine-payments            | trainer+       | Registrér indbetaling                |
| DELETE | /api/fine-payments/:id        | trainer+       | Slet indbetaling                     |

---

## Design & branding

### Klubnavn
- Lang format: **Copenhagen Forza Chang** (bruges i header på desktop, login-side, og officielle kontekster)
- Kort format: **CFC** (bruges i header på mobil, favicon, og kompakte UI-elementer)

### Logo
- Fil: `frontend/src/assets/logo.svg` (transparent SVG — bruges på mørk baggrund)
- Email-logo: `frontend/public/logo-email.jpg` (JPG — bruges i email-skabeloner)
- Brug aldrig logoet på hvid baggrund uden at teste kontrasten

### Farveskema (sort/hvid — dark theme)
```css
--cfc-bg-primary:    #0a0a0a;   /* Sidebaggrund */
--cfc-bg-card:       #1a1a1a;   /* Kort og paneler */
--cfc-bg-hover:      #222222;   /* Hover-states */
--cfc-border:        #2a2a2a;   /* Kanter */
--cfc-text-primary:  #ffffff;   /* Primær tekst */
--cfc-text-muted:    #888888;   /* Dæmpet tekst (labels, meta) */
--cfc-text-subtle:   #555555;   /* Meget dæmpet (placeholders) */
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

### Opret/rediger event (modal)
- Sluttid auto-fyldes til starttid når start sættes
- Mødetid auto-fyldes til start − 40 min
- Tilmeldingsfrist auto-fyldes til start − 7 dage
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

---

## Vigtige noter

- JWT gemmes i `localStorage` på frontend
- `api.ts` bruger `import.meta.env.PROD` til at skelne prod/dev BASE_URL
- Scheduled Worker (cron, dagligt kl. 09:00 UTC) kører både webcal-sync og email-påmindelser
- Navigation: tab "Kalender" (ikon 📅) rutet til `/kalender` → `Matches.tsx`
- Admin-siden har tre tabs: **Spillere**, **Indstillinger** og **Bødekatalog**
- Spillere med `active=0` omtales som **pensionerede** (ikke "passive" eller "tidligere") — i Admin-faner, Stats-filtre og lister
- Admin login: `admin` / `admin123` — **skift dette med det samme i prod!**

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

`GET /api/events` returnerer nu `unread_comments` count per event. `GET /api/events/:id` returnerer `comment_count`.
