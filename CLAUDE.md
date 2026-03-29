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
│   │   ├── index.ts            # Router + scheduled reminders
│   │   ├── lib/auth.ts         # JWT + password helpers
│   │   └── routes/             # auth, matches, signups, stats, fines, players
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
│   │       ├── Matches.tsx     # Tilmelding/afmelding til kampe
│   │       ├── Stats.tsx       # Statistik (19 sæsoner)
│   │       ├── Fines.tsx       # Bødekasse
│   │       └── Admin.tsx       # Spillere, kampe, statistik-indtastning
│   └── vite.config.ts
└── .github/workflows/
    └── deploy.yml              # CI/CD: auto-deploy ved push til main
```

---

## Roller

| Rolle     | Rettigheder                                                        |
|-----------|--------------------------------------------------------------------|
| `spiller` | Se kampe, tilmelde sig, se statistik og bøder                      |
| `træner`  | Alt ovenstående + tilmelde spillere, føre statistik, give bøder    |
| `admin`   | Alt + oprette/redigere spillere og kampe, tildele roller           |

---

## Datamodel

### Spiller (`players`)
Repræsenterer alle der nogensinde har spillet for CFC — også historiske/passive.

| Felt             | Type    | Beskrivelse                           |
|------------------|---------|---------------------------------------|
| `id`             | TEXT    | UUID                                  |
| `name`           | TEXT    | Fulde navn                            |
| `birth_date`     | TEXT    | Fødselsdato (ISO 8601)                |
| `email`          | TEXT    | Email                                 |
| `phone`          | TEXT    | Telefonnummer                         |
| `shirt_number`   | INTEGER | Trøjenummer                           |
| `license_number` | TEXT    | DBU licensnummer                      |
| `status`         | TEXT    | `aktiv` eller `passiv`                |
| `created_at`     | TEXT    | Oprettelsestidspunkt                  |

### Bruger (`users`)
Kun aktive spillere har en bruger. Knyttet til `players` via foreign key.

| Felt            | Type | Beskrivelse                                  |
|-----------------|------|----------------------------------------------|
| `id`            | TEXT | UUID                                         |
| `player_id`     | TEXT | FK → players.id                              |
| `email`         | TEXT | Login-email (samme som spillerens email)     |
| `password_hash` | TEXT | Bcrypt hash                                  |
| `role`          | TEXT | `admin`, `træner` eller `spiller`            |
| `status`        | TEXT | `aktiv` eller `deaktiveret`                  |
| `created_at`    | TEXT | Oprettelsestidspunkt                         |

### Regler
- Alle brugere er spillere, men ikke alle spillere har en bruger
- Når en spiller sættes til `passiv` → bruger sættes til `deaktiveret` automatisk
- Velkomst-email sendes **manuelt** af admin (knap på spillerkortet) — ikke automatisk ved oprettelse
- Password reset sker via email-link (Resend)

### Admin — spilleroversigt
- To separate faner: **Aktive** og **Passive** — ingen samlet liste med filter
- Aktive spillere viser: navn, trøjenummer, rolle, og knapper til redigér / send velkomst-email / sæt passiv
- Passive spillere viser: navn og knap til at genaktivere

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
Push til `main` deployer automatisk både worker og frontend.

Kræver følgende GitHub Secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

---

## Database

```bash
# Kør schema mod prod
wrangler d1 execute forzachang-db --file=database/schema.sql

# Kør en query mod prod
wrangler d1 execute forzachang-db --command "SELECT * FROM players;"

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

| Method | Path                        | Rolle         | Beskrivelse                     |
|--------|-----------------------------|---------------|---------------------------------|
| POST   | /api/auth/login             | Alle          | Login, returnerer JWT           |
| GET    | /api/matches                | player+       | Liste over kampe                |
| POST   | /api/matches                | admin         | Opret kamp                      |
| POST   | /api/signups                | player+       | Tilmeld/afmeld kamp             |
| GET    | /api/stats                  | player+       | Hent statistik                  |
| POST   | /api/stats                  | admin         | Opdater statistik               |
| GET    | /api/fines                  | player+       | Se bøder                        |
| POST   | /api/fines                  | treasurer+    | Giv bøde                        |
| PATCH  | /api/fines/:id              | treasurer+    | Markér bøde betalt              |
| GET    | /api/players                | admin         | Liste over spillere             |
| POST   | /api/players                | admin         | Opret spiller                   |

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
- Badges: grøn for tilmeldt (`#162416` bg / `#5a9e5a` tekst), grå for ikke-tilmeldt
- Ingen skygger — dybde skabes med lagdelte baggrundsfarver

---

## Vigtige noter

- JWT gemmes i `localStorage` på frontend
- `api.ts` bruger `import.meta.env.PROD` til at skelne prod/dev BASE_URL
- Scheduled Worker (cron) sender email-påmindelser via Resend før kampe
- Admin login: `admin` / `admin123` — **skift dette med det samme i prod!**
