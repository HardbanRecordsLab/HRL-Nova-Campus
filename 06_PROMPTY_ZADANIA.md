# 06 — Prompty dla AI buildera (zadania 1–10)

Część pakietu dokumentacji — patrz `00_README_PAKIET.md` dla nawigacji.
Szczegóły architektury: `01_ARCHITEKTURA_I_DECYZJE.md`, model danych:
`02_MODEL_DANYCH.md`, pełna lista endpointów: `03_API_ENDPOINTS.md`, mapa
stron: `04_MAPA_STRON_FRONTEND.md`, env: `05_ENV_I_KONFIGURACJA.md`.

Użyj tego jako sekwencję promptów (jeden na task) wklejanych do agenta buildującego (Cursor / Claude Code / Lovable itp.), pracującego na repo `hrl-course-hub-mega-portal` z dociąganymi fragmentami z `plugin-hub-builder-main` (CourseHub). Rób je **po kolei** — każdy zakłada, że poprzedni jest zamergowany i działa. Po każdym tasku odpal `07_CHECKLISTA_AKCEPTACJI.md`.

Kontekst do wklejenia na start (raz, w system/project prompt agenta):

```
Pracujesz na projekcie hrl-course-hub-mega-portal (Express + Prisma + JWT + Stripe,
docelowo NestJS + PostgreSQL). To platforma sprzedająca dostęp (paywall/access-gateway)
do w pełni gotowych, hostowanych zewnętrznie kursów — NIE tworzymy edytora treści.
Każdy kurs ma już gotowe quizy egzaminacyjne (na końcu i między sekcjami) — ich
zaliczenie automatycznie wydaje certyfikat z kodem QR prowadzącym do publicznej,
wyszukiwalnej bazy absolwentów (wpis tylko po zgodzie RODO studenta).
Drugie źródło (plugin-hub-builder-main / CourseHub) ma równoległy model dostępu
oparty o Supabase — przenosimy z niego logikę biznesową i UI (Radix/shadcn), NIE
Supabase jako backend (docelowy backend to Prisma+Postgres).
Ważne: obecny server.ts NIE używa Prisma w runtime — jedzie na surowym better-sqlite3
z osobnym schematem. Prisma schema istnieje, ale jest odłączona.
```

---

## Task 1 — Ujednolicenie schematu danych (Prisma)
**Prompt:**
> Zaktualizuj `prisma/schema.prisma` w mega-portal. Zachowaj istniejące modele
> (`User`, `StudentProfile`, `AdminProfile`, `Course`, `CourseTranslation`, `Tag`,
> `CourseTag`, `Price`, `Order`, `OrderItem`, `Enrollment`). Dodaj:
> 1. `CourseDomain` — pola: `id, courseId, hostname, createdAt` (relacja do `Course`,
>    unikalność `[courseId, hostname]`) — whitelisting domen do embedowania/redirectu,
>    przeniesione z modelu `course_domains` w CourseHub (Supabase).
> 2. Rozszerz `Enrollment` o: `revokedAt DateTime?`, `grantedByUserId String?`,
>    `source` jako enum `EnrollmentSource { PURCHASE MANUAL ROLE_GRANT }` (zamiast
>    obecnego `String`).
> 3. `Certificate` — pola: `id, userId, courseId, certificateCode (unique), issuedAt,
>    qrPayloadUrl, rodoConsentAt DateTime?, isPublic Boolean @default(false)`.
>    `isPublic` może być `true` tylko gdy `rodoConsentAt` jest ustawione — dodaj
>    komentarz w schema o tej regule (walidacja w warstwie aplikacji, nie DB).
> 4. `GraduateRegistryEntry` (zdenormalizowany, publiczny widok) — pola:
>    `certificateCode, studentDisplayName, courseTitle, issuedAt` — zasilany przy
>    tworzeniu `Certificate` gdy `isPublic = true`.
> 5. `ActivityLog` — pola: `id, userId String?, action, targetType, targetId,
>    metadata Json?, createdAt` — ma zastąpić/rozszerzyć obecną tabelę logów w
>    server.ts (`logActivity()`), pod audit trail zmian dostępu (grant/revoke).
> 6. `AppSetting` — `key (unique), value Json, updatedAt` — ujednolicenie
>    `tenant_settings` z mega-portal i `app_settings`/`integration_configs` z
>    CourseHub w jedną tabelę.
> Nie zmieniaj `Course.integrationType/paywallType/accessType` — już pasują do
> modelu. Wygeneruj migrację Prisma (`prisma migrate dev`) z nazwą
> `merge_coursehub_access_model`.

## Task 2 — Podłączenie Prisma do runtime (zamiast surowego SQL)
**Prompt:**
> `server.ts` obecnie używa `better-sqlite3` bezpośrednio zamiast Prisma Client.
> Przepisz warstwę dostępu do danych na Prisma Client (`@prisma/client`), zachowując
> identyczne kontrakty REST (te same ścieżki, te same kształty JSON w odpowiedziach)
> — to migracja wewnętrzna, frontend nie powinien zauważyć różnicy. Rób to
> endpoint po endpoincie, zaczynając od: `auth/*`, `courses/*`, `student/dashboard`.
> Nie ruszaj jeszcze endpointów quizowych ani certyfikatów (Task 4).
> Po migracji: `DATABASE_URL` ma wskazywać na PostgreSQL (nie SQLite) — zaktualizuj
> `.env.example` i sekcję README o konfiguracji.

## Task 3 — Usunięcie edytora treści instruktora
**Prompt:**
> Usuń z `server.ts` endpointy `POST /api/instructor/lessons` i
> `GET /api/instructor/modules` oraz powiązany frontend (jeśli istnieje UI do
> tworzenia/edycji lekcji przez instruktora — znajdź go i usuń). Zostaw modele/tabele
> `lessons`, `modules`, `quiz_questions` — będą zasilane przez import (Task 5), nie
> przez live-edytor. Sprawdź `AdminPanel.tsx` czy nie linkuje do usuniętego UI.

## Task 4 — Dostęp: grant/revoke/domains/audit (z CourseHub)
**Prompt:**
> Przenieś logikę biznesową z CourseHub (Supabase) do mega-portal (Prisma), bez
> Supabase/RLS — autoryzacja przez istniejący middleware JWT (`authenticateToken`,
> `requireAdmin`):
> 1. `POST /api/admin/courses/:id/grant-by-role` — masowe nadanie `Enrollment`
>    wszystkim userom o danej roli (odpowiednik `grant_course_to_role()` z CourseHub).
> 2. `POST /api/admin/enrollments/:id/revoke` — ustawia `Enrollment.revokedAt`,
>    zapisuje wpis w `ActivityLog`.
> 3. CRUD dla `CourseDomain`: `GET/POST/DELETE /api/admin/courses/:id/domains`.
> 4. Middleware walidujący `Origin`/`Referer` przeciw `CourseDomain` przy
>    `/api/access/launch` dla kursów typu `IFRAME`/`REDIRECT_COOKIE`.
> 5. Każda zmiana `Enrollment` (create/revoke/expire) ma tworzyć wpis w
>    `ActivityLog` z `action` w stylu `enrollment.granted`, `enrollment.revoked`.

## Task 5 — Import gotowych quizów + logika ukończenia
**Prompt:**
> Rozbuduj istniejący `POST /api/admin/import/:type` o typ `quiz` — import gotowych
> pytań quizowych per lekcja/moduł (format: JSON lub CSV, ustal na podstawie
> obecnego kształtu tabeli `quiz_questions`). Upewnij się że
> `GET/POST /api/lessons/:id/quiz` i `POST /api/quiz/:lessonId/submit` działają na
> zaimportowanej treści (bez zmian w logice oceniania). `checkAndGenerateCertificate()`
> zostaje głównym mechanizmem — wywoływany po zaliczeniu WSZYSTKICH quizów kursu
> (już tak działa, zweryfikuj że próg objemuje quizy "pomiędzy sekcjami", nie tylko
> końcowy).

## Task 6 — Certyfikaty z QR + zgoda RODO
**Prompt:**
> 1. Dodaj bibliotekę `qrcode` (npm). W `checkAndGenerateCertificate()`, po
>    wygenerowaniu `certificateCode`, wygeneruj QR kodujący
>    `https://<APP_DOMAIN>/verify/:code` i zapisz jako `qrPayloadUrl` (data URL lub
>    plik w `/public/certificates/`).
> 2. Przy generowaniu certyfikatu (moment ukończenia kursu) pokaż studentowi
>    modal/ekran ze zgodą RODO ("Zgadzam się na publikację mojego imienia i nazwiska
>    oraz nazwy ukończonego kursu w publicznej bazie absolwentów") — checkbox,
>    domyślnie ODZNACZONY. Zapisz wybór jako `Certificate.rodoConsentAt` +
>    `isPublic`.
> 3. Rozbuduj PDF certyfikatu (istniejący `jspdf`/`react-pdf`) o wstawiony QR.
> 4. Rozbuduj `GET /api/verify-certificate/:code` o pełne dane do wyświetlenia
>    strony weryfikacyjnej (imię — tylko jeśli `isPublic`, tytuł kursu, data).
> 5. Nowy endpoint publiczny `GET /api/graduates` — lista `GraduateRegistryEntry`
>    z paginacją i wyszukiwarką (po nazwisku/kursie).
> 6. Nowe strony frontendowe: `/verify/:code` (rozbudowa `CertificateVerify.tsx`)
>    i `/graduates` (nowa, publiczna, przeszukiwalna lista).

## Task 7 — Wydzielenie landing page
**Prompt:**
> `Home.tsx` mesza publiczny landing (hero, CTA, sekcje marketingowe) z widokiem
> dla zalogowanych. Rozdziel to:
> 1. Nowa strona `Landing.tsx` pod `/` — czysto publiczna, SEO-owa (meta tagi,
>    OG tagi), zawiera dotychczasowe sekcje hero/CTA z `Home.tsx` (linie ok. 192–780
>    w obecnym pliku — przenieś, nie duplikuj), plus sekcję "Baza absolwentów"
>    linkującą do `/graduates` jako social proof.
> 2. `Home.tsx` zostaje jako dashboard powitalny WYŁĄCZNIE dla zalogowanych
>    (redirect niezalogowanych na `/`).
> 3. Zaktualizuj routing w `App.tsx`: `/` → `Landing`, `/home` lub `/dashboard` →
>    `Home` (chronione).

## Task 8 — Przeniesienie UI admina z CourseHub
**Prompt:**
> Z `plugin-hub-builder-main/src/pages`: `UsersPage.tsx`, `AccessPage.tsx`,
> `ActivityPage.tsx`, `SettingsPage.tsx` — przenieś jako zakładki wewnątrz
> `AdminPanel.tsx` mega-portal (nie osobne top-level route'y). Podmień wywołania
> Supabase client (`src/integrations/supabase`) na fetch do nowych endpointów z
> Task 4 (`/api/admin/enrollments`, `/api/admin/courses/:id/domains`,
> `/api/admin/activity-log`, `/api/admin/settings`). Zachowaj komponenty
> shadcn/Radix — mega-portal nie ma własnego odpowiednika UI dla tych widoków.

## Task 9 — Sprzątanie i redundancje
**Prompt:**
> Z `plugin-hub-builder-main` NIE przenosimy 1:1: `Courses.tsx`, `Dashboard.tsx`,
> `Index.tsx`, `NotFound.tsx`, `StudentPortal.tsx`, `LoginPage.tsx`,
> `RegisterPage.tsx` — mają odpowiedniki w mega-portal. Usuń cały katalog
> `supabase/` (migracje, edge functions) z finalnego repo — logika już
> przeniesiona do Prisma/Express w Task 1–6. Worker `verifier/cloudflare-worker.js`
> ZOSTAJE jako osobny deployment (nie wchłaniamy do NestJS) — zaktualizuj tylko
> URL-e API na nowe endpointy z Task 4.

## Task 10 — Docelowa migracja Express → NestJS
**Prompt (wykonać na końcu, modułowo):**
> Zamień Express na NestJS zachowując identyczny kontrakt REST, moduł po module:
> `AuthModule` (JWT), `CoursesModule`, `AccessModule` (enrollments/domains/grant),
> `CertificatesModule` (certyfikaty/QR/graduates), `AdminModule` (users/activity/settings),
> `PaymentsModule` (Stripe checkout+webhook). Użyj `@nestjs/config` dla env,
> `PrismaModule` jako globalny provider. Po każdym module — testy manualne na tych
> samych ścieżkach REST przed przejściem dalej.

---

## Kolejność wykonania
Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → (10 na końcu, osobno, po ustabilizowaniu wszystkiego powyżej).

Każdy task to osobna sesja/branch — nie wrzucaj wszystkiego w jeden prompt do buildera, bo przy takiej ilości zmian w dwóch różnych stackach agent gubi kontekst i zaczyna halucynować nieistniejące pliki.
