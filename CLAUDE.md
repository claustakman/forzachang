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
│   │       ├── events.ts       # Events + tilmeldinger (fase 3)
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
│   │       ├── Matches.tsx     # Kampprogram + events (fase 3)
│   │       ├── Stats.tsx       # Statistik (19 sæsoner)
│   │       ├── Fines.tsx       # Bødekasse
│   │       ├── Admin.tsx       # Spillere, events, kampe, statistik, indstillinger
│   │       └── Profile.tsx     # Profil inkl. avatar-upload
│   └── vite.config.ts
└── .github/workflows/
    ├── deploy.yml              # CI/CD: auto-deploy + DB-migrationer ved push til main
    └── migrate.yml             # Manuel workflow til DB-migrationer
```

---

## Roller

| Rolle     | Rettigheder                                                                    |
|-----------|--------------------------------------------------------------------------------|
| `player`  | Se kampe/events, tilmelde sig, se statistik og bøder, redigere egen profil    |
| `trainer` | Alt ovenstående + oprette/redigere events, føre statistik, give bøder          |
| `admin`   | Alt + oprette/redigere spillere, tildele roller, webcal-indstillinger          |

---

## Datamodel

### Spiller (`players`)

| Felt             | Type    | Beskrivelse                           |
|------------------|---------|---------------------------------------|
| `id`             | TEXT    | UUID (bruges også som login-brugernavn) |
| `name`           | TEXT    | Fulde navn                            |
| `birth_date`     | TEXT    | Fødselsdato (ISO 8601)                |
| `email`          | TEXT    | Email                                 |
| `phone`          | TEXT    | Telefonnummer                         |
| `shirt_number`   | INTEGER | Trøjenummer                           |
| `license_number` | TEXT    | DBU licensnummer                      |
| `avatar_url`     | TEXT    | URL til profilbillede i R2            |
| `active`         | INTEGER | 1 = aktiv, 0 = passiv                 |
| `role`           | TEXT    | `player`, `trainer` eller `admin`     |
| `created_at`     | TEXT    | Oprettelsestidspunkt                  |

### Events (`events`) — fase 3

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

### Tilmeldinger (`event_signups`) — fase 3

| Felt         | Type | Beskrivelse                                       |
|--------------|------|---------------------------------------------------|
| `id`         | TEXT | UUID                                              |
| `event_id`   | TEXT | FK → events.id                                    |
| `player_id`  | TEXT | FK → players.id                                   |
| `status`     | TEXT | `tilmeldt` eller `afmeldt`                        |
| `message`    | TEXT | Valgfri besked, fx "kommer 30 min for sent"       |
| `created_at` | TEXT | Tidsstempel for seneste ændring                   |

### Arrangører (`event_organizers`) — fase 3

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

### Legacy-tabeller (bruges stadig til gammel statistik-integration)
- `matches` — gamle kampe (bruges af stats-integration)
- `signups` — gamle tilmeldinger
- `stats` — spillerstatistik pr. kamp
- `fine_types`, `fines` — bødekassen

---

## Regler

- Alle brugere er spillere, men ikke alle spillere har en bruger
- Når en spiller sættes til `passiv` (`active=0`) → kan de ikke logge ind
- Velkomst-email sendes **manuelt** af admin (knap på spillerkortet) — ikke automatisk ved oprettelse
- Password reset sker via email-link (Resend) → `/reset?token=XYZ`

### Profilbilleder (R2)
- Upload via `POST /api/players/:id/avatar` med raw image body
- Gemmes i R2-bucket `forzachang-avatars` under nøglen `avatars/{id}.{ext}`
- Public URL: `https://pub-afc843d1587d4ae3a4aa8f3d76547493.r2.dev/avatars/{id}.{ext}`
- Maks. 5 MB, kun JPG/PNG/WebP

### Webcal-sync
- Admin angiver webcal-URL under Admin → Indstillinger
- Worker cron-job kører dagligt kl. 09:00 UTC
- Sync-logik: tilføj nye, opdater ændrede, markér slettede som `aflyst`
- Baseret på `webcal_uid` (iCal UID-felt)

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

| Method | Path                          | Rolle       | Beskrivelse                          |
|--------|-------------------------------|-------------|--------------------------------------|
| POST   | /api/auth/login               | Alle        | Login, returnerer JWT                |
| GET    | /api/players                  | admin       | Liste over spillere                  |
| POST   | /api/players                  | admin       | Opret spiller                        |
| PUT    | /api/players/:id              | self/admin  | Opdater spiller                      |
| POST   | /api/players/:id/avatar       | self/admin  | Upload profilbillede til R2          |
| GET    | /api/events                   | player+     | Liste over events (med filtre)       |
| GET    | /api/events/:id               | player+     | Detaljer inkl. tilmeldinger          |
| POST   | /api/events                   | trainer+    | Opret event                          |
| PUT    | /api/events/:id               | trainer+/arrangør | Rediger event               |
| DELETE | /api/events/:id               | trainer+    | Slet event                           |
| POST   | /api/events/:id/signup        | player+     | Tilmeld/afmeld fra event             |
| GET    | /api/settings                 | admin       | Hent app-indstillinger               |
| PUT    | /api/settings                 | admin       | Gem app-indstillinger                |
| GET    | /api/matches                  | player+     | Legacy: liste over kampe             |
| POST   | /api/matches                  | admin       | Legacy: opret kamp                   |
| POST   | /api/signups                  | player+     | Legacy: tilmeld/afmeld kamp          |
| GET    | /api/stats                    | player+     | Hent statistik                       |
| POST   | /api/stats                    | admin       | Opdater statistik                    |
| GET    | /api/fines                    | player+     | Se bøder                             |
| POST   | /api/fines                    | trainer+    | Giv bøde                             |
| PATCH  | /api/fines/:id                | trainer+    | Markér bøde betalt                   |

---

## Design & branding

### Klubnavn
- Lang format: **Copenhagen Forza Chang** (bruges i header på desktop, login-side, og officielle kontekster)
- Kort format: **CFC** (bruges i header på mobil, favicon, og kompakte UI-elementer)

### Logo
- Fil: `frontend/src/assets/logo.svg` (transparent SVG — bruges på mørk baggrund)
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

## Vigtige noter

- JWT gemmes i `localStorage` på frontend
- `api.ts` bruger `import.meta.env.PROD` til at skelne prod/dev BASE_URL
- Scheduled Worker (cron, dagligt kl. 09:00 UTC) kører både webcal-sync og email-påmindelser
- Admin login: `admin` / `admin123` — **skift dette med det samme i prod!**
