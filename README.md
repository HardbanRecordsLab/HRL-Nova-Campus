# HRL Nova Campus

Platforma kursowa HardbanRecordsLab — kursy z różnych branż, podpięte
albo jako linki do zewnętrznych URL-i, albo jako samodzielne,
interaktywne pakiety HTML (typ integracji `HOSTED_HTML`), serwowane
studentowi w sandboxed iframe po weryfikacji zapisu na kurs.

Produkcja: `https://nova-campus.hardbanrecordslab.online` (PM2
`nova-campus-api`, VPS `84.247.162.167`). Baza danych: `nova_campus` w
kontenerze `hbrl-postgres` na tym samym serwerze (sekrety wstrzykiwane
przez Infisical, projekt `nova-campus` — zobacz `.env` w tym repo po
uwagi dot. lokalnego developmentu).

## Stack

- Frontend: React + Vite + Tailwind
- Backend: Express (`server.ts`, bundlowany przez esbuild do
  `dist/server.cjs`)
- Baza: PostgreSQL przez Prisma (`prisma/schema.prisma`)

## Lokalny development

**Wymagania:** Node.js ≥ 22 (albo Bun ≥ 1.3.6).

1. Zainstaluj zależności: `npm install`
2. Zobacz `.env` — domyślnie wskazuje na pustą, izolowaną piaskownicę
   Neon do developmentu bez dostępu do realnych danych. Instrukcja
   tunelu SSH do prawdziwej bazy VPS jest w komentarzu na górze pliku.
3. Uruchom: `npm run dev`

## Build i deploy

```bash
npm run build   # vite build + esbuild server.ts -> dist/server.cjs
npm start        # node dist/server.cjs
```

Na VPS uruchamiane przez PM2 (`ecosystem.config.cjs`) poprzez wrapper
Infisical, który wstrzykuje sekrety produkcyjne bez trzymania `.env` na
dysku serwera.
