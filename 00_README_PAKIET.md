# Pakiet integracji: **HRL Nova Campus** (CourseHub → HRL Course Platform)

Robocza nazwa docelowego produktu po scaleniu obu aplikacji: **HRL Nova Campus**
(wcześniej rozważane: "HRL Academy Blast").
Uwaga: przed publicznym użyciem zweryfikuj dostępność domeny bezpośrednio u
rejestratora (np. `hrlnovacampus.com` / `.pl`) — orientacyjne sprawdzenie
wyszukiwarką nie wykryło kolizji dla pełnej frazy, ale samo słowo "Nova" jest
mocno wyeksploatowane w branży edukacyjnej (NOVA University Lisbon, NOVA
Learning, japońska sieć NOVA), więc to nie jest równoważne z realnym WHOIS ani
sprawdzeniem znaku towarowego.

Kompletny zestaw dokumentacji i promptów do przekazania AI builderowi
(Cursor / Claude Code / Windsurf / Lovable itp.), który wykona faktyczne
scalenie `hrl-course-hub-mega-portal` (baza) z `plugin-hub-builder-main` /
CourseHub (dawca funkcji dostępu).

## Kolejność plików

| # | Plik | Po co |
|---|---|---|
| 00 | `00_README_PAKIET.md` | ten plik — nawigacja |
| 01 | `01_ARCHITEKTURA_I_DECYZJE.md` | kontekst biznesowy, decyzje, stan obecny obu repo |
| 02 | `02_MODEL_DANYCH.md` | docelowy schemat Prisma (co jest, co dochodzi) |
| 03 | `03_API_ENDPOINTS.md` | pełna lista endpointów: zostają / znikają / nowe |
| 04 | `04_MAPA_STRON_FRONTEND.md` | routing i pochodzenie każdej strony |
| 05 | `05_ENV_I_KONFIGURACJA.md` | zmienne środowiskowe, sekrety, konfiguracja |
| 06 | `06_PROMPTY_ZADANIA.md` | 10 gotowych promptów do wklejenia agentowi, po kolei |
| 07 | `07_CHECKLISTA_AKCEPTACJI.md` | co sprawdzić po każdym tasku, zanim przejdziesz dalej |

## Jak tego używać
1. Wklej `01`–`05` do agenta jako kontekst projektu (system/project prompt albo
   pliki w repo, np. `/docs/`) — raz, na starcie.
2. Z `06` bierz prompty **pojedynczo**, jeden task = jedna sesja/branch/PR.
3. Po każdym tasku odpal checklistę z `07` zanim zlecisz kolejny — przy takiej
   skali zmian agent bez weryfikacji zacznie się gubić i "naprawiać" rzeczy,
   które już działają.
4. Task 10 (migracja Express → NestJS) rób na samym końcu, dopiero gdy 1–9 są
   stabilne i przetestowane na Express.

## Repozytoria źródłowe
- **Baza (docelowa):** `hrl-course-hub-mega-portal` — Express + Prisma (Postgres,
  schema już gotowa, ale NIEPODŁĄCZONA do runtime) + JWT + Stripe + Firebase +
  Gemini AI. Runtime obecnie jedzie na `better-sqlite3` (osobny, ręczny schemat SQL
  w `server.ts`), nie na Prisma Client.
- **Dawca:** `plugin-hub-builder-main` (CourseHub) — Supabase (Postgres + RLS +
  Edge Functions) + shadcn/Radix UI. Przenosimy z niego logikę dostępu
  (grant/revoke/domains/audit) i komponenty UI, NIE Supabase jako platformę.
