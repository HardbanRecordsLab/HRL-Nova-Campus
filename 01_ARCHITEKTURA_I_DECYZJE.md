# Architektura i decyzje biznesowe

## Model biznesowy (ustalony)
Platforma jest **paywallem / gatewayem dostępu** do w pełni gotowych,
hostowanych zewnętrznie kursów wideo. Platforma NIE jest CMS-em / edytorem
treści kursowych.

- Kursy są w 100% gotowe (hostowane zewnętrznie, dostęp przez JWT link / iframe
  / redirect cookie / custom API — patrz `Course.integrationType`).
- Każdy kurs ma już **gotowe quizy egzaminacyjne** (na końcu i pomiędzy
  sekcjami) — to część dostarczonej treści, nie coś tworzonego w platformie.
  Trafiają do systemu przez import (nie przez live-edytor instruktora).
- Zaliczenie wszystkich quizów kursu → automatyczne wydanie certyfikatu.
- Certyfikat zawiera kod QR prowadzący do publicznej strony weryfikacyjnej
  `/verify/:code`.
- Student może (opcjonalnie, checkbox domyślnie odznaczony) wyrazić zgodę RODO
  na publikację wpisu (imię, tytuł kursu, data) w publicznej, przeszukiwalnej
  bazie absolwentów `/graduates`.
- Platforma ma osobną, publiczną, marketingowo-sprzedażową stronę główną
  (landing page) — różną od dashboardu powitalnego dla zalogowanych.

## Stan obecny — mega-portal (baza)
- Stack: Express + Prisma (`schema.prisma` już modeluje `externalUrl`,
  `integrationType`, `paywallType`, `accessType` — koncepcyjnie zgodne z
  modelem biznesowym powyżej) + JWT (`jsonwebtoken`, `bcryptjs`) + Stripe +
  Firebase/Firebase Admin + Gemini AI (`@google/genai`) + i18n.
- **Krytyczne:** `server.ts` NIE korzysta z Prisma Client w runtime — cała
  logika (auth, kursy, quizy, certyfikaty, admin) działa na surowym
  `better-sqlite3` z osobnym, ręcznie tworzonym schematem SQL. `prisma/schema.prisma`
  istnieje i ma `datasource db { provider = "postgresql" }`, ale jest odłączona
  od kodu — to dług techniczny do spłacenia w Task 1–2 (patrz `06_PROMPTY_ZADANIA.md`).
- Frontend: React 19 + Vite + react-router-dom v7, własny zestaw komponentów
  (nie shadcn).
- Ma już: auth, checkout Stripe + webhook, panel admina, system wiadomości,
  reklamy, ustawienia tenant, quizy + ocenianie, generowanie certyfikatów
  (`checkAndGenerateCertificate`), weryfikację certyfikatu (`/api/verify-certificate/:code`).
- Ma, ale ZBĘDNE względem modelu biznesowego: `POST /api/instructor/lessons`,
  `GET /api/instructor/modules` — żywe tworzenie treści przez instruktora w UI
  (quizy mają być importowane, nie tworzone interaktywnie).

## Stan obecny — CourseHub / plugin-hub-builder-main (dawca)
- Stack: Supabase (Postgres + RLS + Edge Functions: `generate-access-link`,
  `send-access-email`) + osobny Cloudflare Worker `verifier` + React + shadcn/Radix UI.
- Model danych już bardzo bliski docelowemu: `courses` (`course_url`, `jwt_secret`,
  `access_type='jwt_link'`), `course_access` (grant/revoke/`expires_at`),
  `course_domains` (whitelisting hostname do embedowania), audit trigger na
  `course_access`, `app_settings`/`integration_configs`.
- Ma UI, którego mega-portal nie ma: `UsersPage`, `AccessPage`, `ActivityPage`,
  `SettingsPage` — dobre komponenty (Radix), warte przeniesienia.
- Ma redundantne odpowiedniki (NIE przenosić 1:1): `Courses.tsx`, `Dashboard.tsx`,
  `Index.tsx`, `NotFound.tsx`, `StudentPortal.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`.

## Decyzja: co zostaje z Cloudflare Worker
`verifier` (Cloudflare Worker z CourseHub) **zostaje jako osobny deployment**
— szybka warstwa walidacji blisko brzegu sieci, NIE wchłaniamy go do NestJS.
Trzeba tylko podmienić w nim URL-e API na nowe endpointy backendu po merge
(Task 9).

## Docelowy stack (koniec drogi)
NestJS + PostgreSQL (Prisma jako ORM, realnie podłączona) + Vercel (frontend,
zgodnie z resztą ekosystemu HRL) + VPS (backend, PM2). Migracja Express → NestJS
robiona na samym końcu (Task 10), modułowo, z zachowaniem identycznego
kontraktu REST na każdym kroku.
