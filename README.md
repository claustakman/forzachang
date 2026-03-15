# Forza Chang FC — App

Spillerapp til tilmelding, statistik og bødekasse.

**URL:** https://forzachang.pages.dev

---

## Stack

| Lag | Teknologi | Pris |
|-----|-----------|------|
| Frontend | React + Vite → Cloudflare Pages | Gratis |
| API | Cloudflare Workers | Gratis (100k req/dag) |
| Database | Cloudflare D1 (SQLite) | Gratis (5GB) |
| Email | Resend | Gratis (3000 mails/md) |
| CI/CD | GitHub Actions | Gratis |

---

## Første gang — opsætning (ca. 20 min)

### 1. Forudsætninger

```bash
# Installer Node.js (https://nodejs.org) og kør:
npm install -g wrangler
wrangler login
```

### 2. Opret D1 database

```bash
wrangler d1 create forzachang-db
# Kopiér det viste database_id og indsæt i worker/wrangler.toml
```

### 3. Kør database-schema

```bash
wrangler d1 execute forzachang-db --file=database/schema.sql
```

### 4. Sæt hemmeligheder

```bash
wrangler secret put JWT_SECRET
# Skriv en lang tilfældig streng, fx: openssl rand -base64 32

wrangler secret put RESEND_API_KEY
# Opret gratis konto på resend.com og indsæt din API key
```

### 5. Deploy Worker

```bash
cd worker
npm install
npm run deploy
# Noter den viste workers.dev URL og opdatér APP_URL i wrangler.toml
```

### 6. Opdatér frontend API URL

Åbn `frontend/src/lib/api.ts` og ret:
```ts
const BASE = import.meta.env.PROD
  ? 'https://forzachang-api.DIT-NAVN.workers.dev'  // ← indsæt din Worker URL
  : '/api';
```

### 7. Deploy frontend

```bash
cd frontend
npm install
npm run build
wrangler pages deploy dist --project-name=forzachang
```

Appen er nu live på **https://forzachang.pages.dev** 🎉

---

## GitHub Actions (automatisk deploy ved push)

1. Gå til dit GitHub repo → Settings → Secrets and variables → Actions
2. Tilføj:
   - `CLOUDFLARE_API_TOKEN` — opret token på dash.cloudflare.com med Workers + Pages rettigheder
   - `CLOUDFLARE_ACCOUNT_ID` — find på din Cloudflare dashboard forside

Herefter deployes appen automatisk hver gang du pusher til `main`.

---

## Tilføj spillere

Log ind som `admin` (kodeord: `admin123`) og gå til Admin → Spillere → Tilføj spiller.

**Skift admin-kodeordet med det samme!**

```bash
# Eller via wrangler:
wrangler d1 execute forzachang-db --command "
  UPDATE players SET password_hash = 'NYT_HASH' WHERE id = 'admin';
"
```

---

## Webcal / iCal import (fremtidig funktion)

Kamprogrammet kan importeres fra en Webcal-URL ved at tilføje en Worker-route der:
1. Fetcher `.ics`-filen fra jeres turnerings-udbyder
2. Parser VEVENT-blokke med `ical.js`
3. Inserter kampe i D1 via `wrangler d1 execute`

Se `database/schema.sql` for matches-tabellen.

---

## Mappestruktur

```
forzachang/
├── database/
│   └── schema.sql          # D1 database schema + seed data
├── worker/                 # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts        # Router + scheduled reminders
│   │   ├── lib/auth.ts     # JWT + password helpers
│   │   └── routes/         # auth, matches, signups, stats, fines, players
│   └── wrangler.toml
├── frontend/               # React app
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts      # API client
│   │   │   └── auth.tsx    # Auth context
│   │   ├── components/
│   │   │   └── Layout.tsx  # Navigation shell
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Matches.tsx # Tilmelding/afmelding
│   │       ├── Stats.tsx   # Statistik (19 sæsoner)
│   │       ├── Fines.tsx   # Bødekasse
│   │       └── Admin.tsx   # Spillere, kampe, statistik-indtastning
│   └── vite.config.ts
└── .github/workflows/
    └── deploy.yml          # CI/CD
```

---

## Roller

| Rolle | Kan |
|-------|-----|
| `player` | Se kampe, tilmelde sig, se statistik og bøder |
| `treasurer` | Alt ovenstående + give og markere bøder betalt |
| `admin` | Alt + oprette spillere og kampe, redigere statistik |
