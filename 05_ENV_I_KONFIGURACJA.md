# Środowisko i konfiguracja

## Obecne zmienne (mega-portal `.env.example`)
```
GEMINI_API_KEY=          # Gemini AI — AI Studio wstrzykuje automatycznie
APP_URL=                 # URL aplikacji — self-referential links, callbacki
JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## Do dodania przy migracji na PostgreSQL (Task 2)
```
DATABASE_URL=            # postgresql://user:pass@host:5432/dbname
                          # docelowo VPS Postgres, zgodnie z resztą ekosystemu HRL
```
Uwaga: `schema.prisma` już deklaruje `provider = "postgresql"` — sam fakt
istnienia `DATABASE_URL` nie wystarczy, dopóki Task 2 nie podłączy realnie
Prisma Client do `server.ts` (obecnie runtime ignoruje Prisma i jedzie na
lokalnym pliku SQLite przez `better-sqlite3`).

## Do dodania przy certyfikatach/QR (Task 6)
```
APP_DOMAIN=               # domena publiczna do budowy URL w QR (https://APP_DOMAIN/verify/:code)
                          # może być tożsame z APP_URL — ujednolicić nazewnictwo przy migracji
```

## Do dodania przy przenoszeniu logiki z CourseHub (Task 4, 9)
Zmienne specyficzne dla Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) — **NIE przenosimy** do mega-portal, bo Supabase
nie jest częścią docelowego stacku. Jeśli Cloudflare Worker `verifier` (który
zostaje jako osobny deployment) potrzebuje jakiegoś sekretu do walidacji
tokenów wobec nowego backendu — ustalić wspólny sekret (np. ten sam co
`JWT_SECRET` albo osobny `VERIFIER_SHARED_SECRET`) i skonfigurować go osobno
w env Workera (Cloudflare dashboard / `wrangler.toml`), nie w repo mega-portal.

## Firebase — decyzja do podjęcia przez Kamila
Mega-portal ma zależności `firebase` + `firebase-admin`, ale reszta ekosystemu
HRL jest self-hosted (VPS, PostgreSQL, bez usług Google). Przed Task 10
(migracja do NestJS) warto ustalić: czy Firebase zostaje (do czego jest
realnie używane w `server.ts`?), czy jest do wycięcia na rzecz w pełni
self-hosted stacku. Nie jest to blokujące dla Task 1–9.

## Sekrety per-środowisko
Rekomendacja: `.env.example` w repo (bez wartości), realne sekrety w
`.env.local` (gitignored) lokalnie i w zmiennych środowiskowych VPS (PM2
ecosystem file lub systemd unit) na produkcji — zgodnie z resztą architektury
HRL opisanej w dokumentacji ekosystemu.
